// Núcleo do bot: recebe uma mensagem e devolve as respostas a enviar.
// Não conhece WhatsApp — quem conversa com a plataforma são os adaptadores.
import { config } from "../config.js";
import { mensagens } from "../mensagens.js";
import { adicionarNaFila } from "../queue/gerenciadorFila.js";
import { atualizarSessao, criarSessao, encerrarSessao, obterSessao } from "../bot/gerenciadorDeSessao.js";
import type { Categoria, Fluxo, MensagemRecebida, Passo, Sessao, Solicitacao } from "../types.js";
import { fluxos, opcoesDoMenu, textoDaPergunta } from "./fluxos.js";
import { dataBR, dentroDoHorario, proximoDiaUtil } from "./horario.js";
import {
  validarData,
  validarDocumento,
  validarNome,
  validarOpcao,
  validarTexto,
  validarValor,
  type Validacao,
} from "./validadores.js";

// O cartório definiu que não é necessário voltar ao menu, mas reconhecer estas
// palavras é barato e evita que alguém fique travado no fluxo errado.
const PALAVRAS_MENU = ["menu", "voltar", "cancelar", "inicio", "início"];

export function processarMensagem(msg: MensagemRecebida): string[] {
  const respostas: string[] = [];
  const { sessao, expirada } = obterSessao(msg.telefone, msg.recebidaEm);
  if (expirada) respostas.push(mensagens.inatividade());

  if (!sessao) {
    criarSessao(msg.telefone, msg.recebidaEm);
    if (!expirada) respostas.push(mensagens.saudacao());
    respostas.push(mensagens.menu());
    return respostas;
  }

  const texto = msg.texto.trim();

  if (PALAVRAS_MENU.includes(texto.toLowerCase())) {
    atualizarSessao(msg.telefone, { categoria: null, indicePasso: 0, dados: {}, tentativas: 0 }, msg.recebidaEm);
    respostas.push(mensagens.menu());
    return respostas;
  }

  if (!sessao.categoria) {
    respostas.push(...escolherNoMenu(msg, texto));
    return respostas;
  }

  respostas.push(...responderPasso(msg, sessao, sessao.categoria));
  return respostas;
}

function escolherNoMenu(msg: MensagemRecebida, texto: string): string[] {
  const categoria = opcoesDoMenu[texto];
  if (!categoria) return [mensagens.opcaoInvalida()];

  const fluxo = fluxos[categoria];
  const primeiro = proximoPasso(fluxo, 0, {});
  if (!primeiro) return [mensagens.opcaoInvalida()];

  atualizarSessao(msg.telefone, { categoria, indicePasso: primeiro.indice, dados: {}, tentativas: 0 }, msg.recebidaEm);

  return [textoDaPergunta(primeiro.passo)];
}

function responderPasso(msg: MensagemRecebida, sessao: Sessao, categoria: Categoria): string[] {
  const fluxo = fluxos[categoria];
  const atual = proximoPasso(fluxo, sessao.indicePasso, sessao.dados);
  if (!atual) return finalizar(msg, sessao, fluxo, sessao.dados);

  const resultado = validarResposta(atual.passo, msg);

  if (!resultado.ok) {
    const tentativas = sessao.tentativas + 1;

    if (tentativas >= config.sessao.maxTentativas) {
      return [resultado.erro, ...encaminharParaAtendente(msg, sessao, fluxo, atual.passo)];
    }

    atualizarSessao(msg.telefone, { tentativas }, msg.recebidaEm);
    return [resultado.erro];
  }

  const dados = { ...sessao.dados, [atual.passo.chave]: resultado.valor };
  const seguinte = proximoPasso(fluxo, atual.indice + 1, dados);

  if (seguinte) {
    atualizarSessao(msg.telefone, { dados, indicePasso: seguinte.indice, tentativas: 0 }, msg.recebidaEm);
    return [textoDaPergunta(seguinte.passo)];
  }

  return finalizar(msg, sessao, fluxo, dados);
}

// Fora do horário oficial a solicitação não é recusada — só cai na fila do
// próximo dia útil em vez da de hoje (ver ARQUITETURA.md, decisão que
// substituiu o ADR-009).
function diaDaFila(agora: Date): Date {
  return dentroDoHorario(agora) ? agora : proximoDiaUtil(agora);
}

function finalizar(msg: MensagemRecebida, sessao: Sessao, fluxo: Fluxo, dados: Record<string, string>): string[] {
  const diaFila = diaDaFila(msg.recebidaEm);
  const solicitacao = enfileirar(sessao.telefone, fluxo.categoria, dados, msg.recebidaEm, diaFila);
  encerrarSessao(sessao.telefone);

  const respostas = [fluxo.confirmacao(solicitacao)];
  if (!dentroDoHorario(msg.recebidaEm)) respostas.push(mensagens.foraDoHorarioAvisoFila(dataBR(diaFila)));
  return respostas;
}

// Na 3ª tentativa errada o cliente entra na fila da própria categoria com uma
// observação, para a atendente terminar a coleta manualmente.
function encaminharParaAtendente(msg: MensagemRecebida, sessao: Sessao, fluxo: Fluxo, passo: Passo): string[] {
  const dados: Record<string, string> = {
    ...sessao.dados,
    observacao: `Não conseguiu informar "${passo.rotulo}". Último envio: "${msg.texto.trim()}"`,
  };

  const diaFila = diaDaFila(msg.recebidaEm);
  const solicitacao = enfileirar(sessao.telefone, fluxo.categoria, dados, msg.recebidaEm, diaFila);
  encerrarSessao(sessao.telefone);

  const respostas = [`${mensagens.encaminhandoParaAtendente()}\n\n${mensagens.naFila(solicitacao.numeroFila)}`];
  if (!dentroDoHorario(msg.recebidaEm)) respostas.push(mensagens.foraDoHorarioAvisoFila(dataBR(diaFila)));
  return respostas;
}

function enfileirar(
  telefone: string,
  categoria: Categoria,
  dados: Record<string, string>,
  agora: Date,
  diaFila: Date,
): Solicitacao {
  const { nome = "(não informado)", documento = "", ...dadosExtras } = dados;
  return adicionarNaFila({ categoria, telefone, nome, documento, dadosExtras }, agora, diaFila);
}

// Encontra o próximo passo aplicável a partir de um índice, pulando os passos
// cuja condição não se aplica (ex: "outro período" da certidão).
function proximoPasso(
  fluxo: Fluxo,
  indice: number,
  dados: Record<string, string>,
): { passo: Passo; indice: number } | null {
  for (let i = Math.max(0, indice); i < fluxo.passos.length; i++) {
    const passo = fluxo.passos[i];
    if (!passo) continue;
    if (!passo.condicao || passo.condicao(dados)) return { passo, indice: i };
  }
  return null;
}

function validarResposta(passo: Passo, msg: MensagemRecebida): Validacao {
  if (passo.tipo === "midia") {
    if (!msg.midia) return { ok: false, erro: mensagens.aguardandoComprovante() };
    const nome = msg.midia.nomeArquivo || msg.midia.tipo;
    return { ok: true, valor: `${msg.midia.tipo} (${nome})` };
  }

  if (msg.midia && !msg.texto.trim()) {
    return { ok: false, erro: mensagens.respondaComTexto() };
  }

  switch (passo.tipo) {
    case "documento":
      return validarDocumento(msg.texto);
    case "nome":
      return validarNome(msg.texto);
    case "valor":
      return validarValor(msg.texto);
    case "data":
      return validarData(msg.texto, msg.recebidaEm);
    case "opcoes":
      return validarOpcao(msg.texto, passo.opcoes ?? []);
    case "texto":
      return validarTexto(msg.texto);
  }
}
