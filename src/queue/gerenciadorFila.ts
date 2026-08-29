import type { Categoria, NovaSolicitacao, Solicitacao } from "../types.js";
import { dataISO } from "../core/horario.js";
import { anexarCsv, carregarEstado, salvarEstado, type EstadoFila } from "./persistencia.js";

let estado: EstadoFila | null = null;

// A numeração é GERAL (não por categoria) e reinicia todo dia, para que o
// número diga ao cliente quantas pessoas estão na frente dele hoje.
function obterEstado(agora: Date): EstadoFila {
  const dia = dataISO(agora);

  if (!estado) estado = carregarEstado(dia);
  if (!estado || estado.dia !== dia) estado = { dia, ultimoNumero: 0, solicitacoes: [] };

  return estado;
}

export function adicionarNaFila(nova: NovaSolicitacao, agora = new Date()): Solicitacao {
  const atual = obterEstado(agora);
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
