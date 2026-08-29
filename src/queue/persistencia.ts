// Grava a fila em disco para que uma reinicialização não perca as solicitações
// do dia, e gera um CSV por dia (planilha que a atendente pode abrir).
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { fluxos } from "../core/fluxos.js";
import type { Solicitacao } from "../types.js";
import { dataBR, horaBR } from "../core/horario.js";

export interface EstadoFila {
  dia: string; // "YYYY-MM-DD"
  ultimoNumero: number;
  solicitacoes: Solicitacao[];
}

const pasta = config.persistencia.pasta;
const arquivoEstado = join(pasta, "fila-atual.json");

function garantirPasta(): void {
  if (!existsSync(pasta)) mkdirSync(pasta, { recursive: true });
}

export function carregarEstado(diaAtual: string): EstadoFila | null {
  if (!existsSync(arquivoEstado)) return null;

  try {
    const bruto: unknown = JSON.parse(readFileSync(arquivoEstado, "utf8"));
    if (typeof bruto !== "object" || bruto === null) return null;

    const estado = bruto as EstadoFila;
    if (estado.dia !== diaAtual) return null; // dia virou: a fila reinicia do zero

    return {
      dia: estado.dia,
      ultimoNumero: estado.ultimoNumero,
      solicitacoes: estado.solicitacoes.map((s) => ({ ...s, dataHora: new Date(s.dataHora) })),
    };
  } catch {
    return null;
  }
}

export function salvarEstado(estado: EstadoFila): void {
  garantirPasta();
  writeFileSync(arquivoEstado, JSON.stringify(estado, null, 2), "utf8");
}

function celula(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

const COLUNAS = ["Nº fila", "Protocolo", "Data", "Hora", "Categoria", "Nome", "CPF/CNPJ", "Telefone", "Detalhes"];

export function anexarCsv(solicitacao: Solicitacao): void {
  garantirPasta();
  const arquivo = join(pasta, `solicitacoes-${solicitacao.protocolo.slice(0, 10)}.csv`);

  if (!existsSync(arquivo)) {
    writeFileSync(arquivo, `\uFEFF${COLUNAS.map(celula).join(";")}\n`, "utf8");
  }

  const detalhes = detalhesLegiveis(solicitacao);
  const linha = [
    String(solicitacao.numeroFila),
    solicitacao.protocolo,
    dataBR(solicitacao.dataHora),
    horaBR(solicitacao.dataHora),
    fluxos[solicitacao.categoria].titulo,
    solicitacao.nome,
    solicitacao.documento,
    solicitacao.telefone,
    detalhes,
  ];

  appendFileSync(arquivo, `${linha.map(celula).join(";")}\n`, "utf8");
}

// Rótulos de chaves que o motor cria fora dos passos do fluxo.
const ROTULOS_EXTRAS: Record<string, string> = { observacao: "Observação" };

// Usa os rótulos definidos no fluxo, para a atendente ler "Valor pago: 350,00"
// em vez de "valor: 350,00".
export function detalhesLegiveis(solicitacao: Solicitacao): string {
  const passos = fluxos[solicitacao.categoria].passos;

  return Object.entries(solicitacao.dadosExtras)
    .map(([chave, valor]) => {
      const rotulo = passos.find((p) => p.chave === chave)?.rotulo ?? ROTULOS_EXTRAS[chave] ?? chave;
      return `${rotulo}: ${valor}`;
    })
    .join(" | ");
}
