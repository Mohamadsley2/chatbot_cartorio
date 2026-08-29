import { config } from "../config.js";
import type { Sessao } from "../types.js";

const sessoes = new Map<string, Sessao>();

function timeoutMs(): number {
  return config.sessao.timeoutMinutos * 60 * 1000;
}

export interface ResultadoSessao {
  sessao: Sessao | null;
  expirada: boolean; // havia uma conversa em andamento que estourou o tempo
}

export function obterSessao(telefone: string, agora = new Date()): ResultadoSessao {
  const sessao = sessoes.get(telefone);
  if (!sessao) return { sessao: null, expirada: false };

  if (agora.getTime() - sessao.ultimaAtividade.getTime() > timeoutMs()) {
    sessoes.delete(telefone);
    // Só avisa da inatividade se o cliente estava no meio de um fluxo;
    // quem parou no menu não precisa de explicação.
    return { sessao: null, expirada: sessao.categoria !== null };
  }

  return { sessao, expirada: false };
}

export function criarSessao(telefone: string, agora = new Date()): Sessao {
  const sessao: Sessao = {
    telefone,
    categoria: null,
    indicePasso: 0,
    dados: {},
    tentativas: 0,
    ultimaAtividade: agora,
  };
  sessoes.set(telefone, sessao);
  return sessao;
}

export function atualizarSessao(telefone: string, campos: Partial<Sessao>, agora = new Date()): Sessao | null {
  const sessao = sessoes.get(telefone);
  if (!sessao) return null;

  const atualizada: Sessao = { ...sessao, ...campos, ultimaAtividade: agora };
  sessoes.set(telefone, atualizada);
  return atualizada;
}

export function encerrarSessao(telefone: string): void {
  sessoes.delete(telefone);
}
