import type { Categoria, NovaSolicitacao, Solicitacao } from "../types.js";
import { dataISO } from "../core/horario.js";
import { anexarCsv, carregarEstado, salvarEstado, type EstadoFila } from "./persistencia.js";

let estado: EstadoFila | null = null;

// A numeração é GERAL (não por categoria) e reinicia todo dia, para que o
// número diga ao cliente quantas pessoas estão na frente dele hoje.
function obterEstado(agora: Date): EstadoFila {
  const dia = dataISO(agora);

  // Recarrega do disco sempre que o dia pedido muda em memória — não só na
  // primeira chamada do processo. Sem isso, um dia que já tinha solicitações
  // gravadas (ex: fila do próximo dia útil, preenchida no fim de semana) seria
  // tratado como vazio e sobrescrito na próxima gravação, apagando os pedidos.
  if (!estado || estado.dia !== dia) estado = carregarEstado(dia) ?? { dia, ultimoNumero: 0, solicitacoes: [] };

  return estado;
}

// `agora` é o instante real em que o cliente escreveu (aparece no CSV para a
// atendente). `diaFila` é o dia cujo contador/arquivo recebe a solicitação —
// igual a `agora`, exceto quando a mensagem chegou fora do horário oficial,
// caso em que é o próximo dia útil (calculado em core/motor.ts).
export function adicionarNaFila(nova: NovaSolicitacao, agora = new Date(), diaFila: Date = agora): Solicitacao {
  const atual = obterEstado(diaFila);
  atual.ultimoNumero += 1;

  const entrada: Solicitacao = {
    ...nova,
    numeroFila: atual.ultimoNumero,
    protocolo: `${atual.dia}-${String(atual.ultimoNumero).padStart(3, "0")}`,
    dataHora: agora,
  };

  atual.solicitacoes.push(entrada);
  salvarEstado(atual);
  anexarCsv(entrada);

  return entrada;
}

// Fila geral do dia, na ordem de chegada.
export function obterFila(agora = new Date()): Solicitacao[] {
  return [...obterEstado(agora).solicitacoes];
}

// Mesma fila, filtrada pela "pasta" da categoria (visão da atendente).
export function obterFilaPorCategoria(categoria: Categoria, agora = new Date()): Solicitacao[] {
  return obterFila(agora).filter((s) => s.categoria === categoria);
}

export function reiniciarFilaEmMemoria(): void {
  estado = null;
}
