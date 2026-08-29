// Ponto de entrada.
//   npm run dev       -> abre o simulador de conversa no terminal
//   npm run painel    -> imprime a fila do dia (visão da atendente)
//   npm run whatsapp  -> liga no WhatsApp de verdade (Cloud API da Meta)
import { criarAdaptadorMeta } from "./adapters/metaCloud.js";
import { criarSimulador } from "./adapters/simulador.js";
import { processarMensagem } from "./core/motor.js";
import { formatarFila } from "./painel.js";
import type { AdaptadorWhatsApp } from "./adapters/tipos.js";

async function conectar(adaptador: AdaptadorWhatsApp): Promise<void> {
  await adaptador.iniciar(async (mensagem) => {
    for (const resposta of processarMensagem(mensagem)) {
      await adaptador.enviar(mensagem.telefone, resposta);
    }
  });
}

const modo = process.argv[2] ?? "simulador";

if (modo === "painel") {
  console.log(formatarFila());
} else if (modo === "meta") {
  const adaptador = criarAdaptadorMeta();
  // Ctrl+C (ou o `docker stop` do servidor) fecha o webhook sem deixar o
  // processo pendurado.
  for (const sinal of ["SIGINT", "SIGTERM"] as const) {
    process.on(sinal, () => void adaptador.parar());
  }
  await conectar(adaptador);
} else {
  await conectar(criarSimulador());
}
