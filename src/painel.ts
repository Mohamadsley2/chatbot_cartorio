// Visão da fila para as atendentes. Enquanto a plataforma de WhatsApp não for
// definida, este é o "painel": a fila geral do dia e as pastas por categoria.
import { fluxos } from "./core/fluxos.js";
import { dataBR, horaBR } from "./core/horario.js";
import { obterFila } from "./queue/gerenciadorFila.js";
import { detalhesLegiveis } from "./queue/persistencia.js";
import type { Categoria, Solicitacao } from "./types.js";

export function formatarFila(agora = new Date()): string {
  const fila = obterFila(agora);
  const linhas: string[] = [`Fila de ${dataBR(agora)} — ${fila.length} solicitação(ões)`, ""];

  if (fila.length === 0) {
    linhas.push("Nenhuma solicitação hoje.");
    return linhas.join("\n");
  }

  for (const solicitacao of fila) {
    linhas.push(resumo(solicitacao));
  }

  linhas.push("", "Por categoria:");
  for (const [categoria, itens] of agruparPorCategoria(fila)) {
    const numeros = itens.map((s) => `#${s.numeroFila}`).join(", ");
    linhas.push(`  ${fluxos[categoria].titulo} (${itens.length}): ${numeros}`);
  }

  return linhas.join("\n");
}

function resumo(s: Solicitacao): string {
  const detalhes = detalhesLegiveis(s);
  const cabecalho =
    `#${String(s.numeroFila).padStart(3, "0")}  ${horaBR(s.dataHora)}  ` +
    `${fluxos[s.categoria].titulo}  |  ${s.nome}` +
    (s.documento ? `  |  ${s.documento}` : "") +
    `  |  ${s.telefone}`;

  return detalhes ? `${cabecalho}\n       ${detalhes}` : cabecalho;
}

function agruparPorCategoria(fila: Solicitacao[]): Map<Categoria, Solicitacao[]> {
  const grupos = new Map<Categoria, Solicitacao[]>();

  for (const solicitacao of fila) {
    const atual = grupos.get(solicitacao.categoria) ?? [];
    atual.push(solicitacao);
    grupos.set(solicitacao.categoria, atual);
  }

  return grupos;
}
