// Adaptador de testes: conversa com o bot pelo terminal, sem WhatsApp nenhum.
// Serve para o cartório revisar as perguntas e as respostas antes de ligar em
// produção.
import { createInterface, type Interface } from "node:readline";
import { formatarFila } from "../painel.js";
import { encerrarSessao } from "../bot/gerenciadorDeSessao.js";
import { dataISO } from "../core/horario.js";
import type { MensagemRecebida, Midia } from "../types.js";
import type { AdaptadorWhatsApp } from "./tipos.js";

const AJUDA = [
  "Comandos do simulador:",
  "  /fila                mostra a fila do dia (visão da atendente)",
  "  /foto                envia uma imagem fictícia junto com a próxima mensagem",
  "  /pdf                 envia um PDF fictício junto com a próxima mensagem",
  "  /hora 17:00          finge que agora são 17:00 (para testar fora do horário)",
  "  /data 22/08/2026     finge que hoje é essa data (sábado, feriado etc.)",
  "  /telefone 5551988887 troca o cliente simulado",
  "  /reset               esquece a sessão do cliente atual",
  "  /ajuda               mostra esta lista",
  "  /sair                encerra",
].join("\n");

export function criarSimulador(): AdaptadorWhatsApp {
  let telefone = "5551999990001";
  let midia: Midia | null = null;
  let horaFixa: string | null = null;
  let dataFixa: string | null = null;
  let leitor: Interface | null = null;
  let fechado = false;

  // Brasília/São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019).
  const agora = (): Date => {
    if (!horaFixa && !dataFixa) return new Date();
    const dia = dataFixa ?? dataISO(new Date());
    const hora = horaFixa ?? "10:00";
    return new Date(`${dia}T${hora}:00-03:00`);
  };

  const comando = (linha: string): boolean => {
    const [nome = "", ...resto] = linha.trim().split(/\s+/);
    const argumento = resto.join(" ");

    switch (nome) {
      case "/ajuda":
        console.log(AJUDA);
        return true;

      case "/fila":
        console.log(`\n${formatarFila(agora())}\n`);
        return true;

      case "/foto":
        midia = { tipo: "imagem", nomeArquivo: "comprovante.jpg" };
        console.log("(imagem anexada à próxima mensagem — pode enviar um texto vazio)");
        return true;

      case "/pdf":
        midia = { tipo: "documento", nomeArquivo: "comprovante-pix.pdf" };
        console.log("(PDF anexado à próxima mensagem — pode enviar um texto vazio)");
        return true;

      case "/hora": {
        if (!/^\d{1,2}:\d{2}$/.test(argumento)) {
          console.log("Use: /hora 17:00 (ou /hora limpar)");
          if (argumento === "limpar") horaFixa = null;
          return true;
        }
        const [h = "0", m = "00"] = argumento.split(":");
        horaFixa = `${h.padStart(2, "0")}:${m}`;
        console.log(`(agora o bot acha que são ${horaFixa})`);
        return true;
      }

      case "/data": {
        const partes = argumento.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!partes) {
          console.log("Use: /data 22/08/2026 (ou /data limpar)");
          if (argumento === "limpar") dataFixa = null;
          return true;
        }
        dataFixa = `${partes[3]}-${partes[2]}-${partes[1]}`;
        console.log(`(agora o bot acha que hoje é ${argumento})`);
        return true;
      }

      case "/telefone":
        if (!/^\d{8,15}$/.test(argumento)) {
          console.log("Use: /telefone 5551988887777");
          return true;
        }
        telefone = argumento;
        console.log(`(cliente simulado agora é ${telefone})`);
        return true;

      case "/reset":
        encerrarSessao(telefone);
        console.log("(sessão apagada)");
        return true;

      case "/sair":
        fechado = true;
        leitor?.close();
        return true;

      default:
        return false;
    }
  };

  return {
    nome: "simulador",

    async iniciar(aoReceber) {
      leitor = createInterface({ input: process.stdin, output: process.stdout });

      console.log("=== Simulador do chatbot do cartório ===");
      console.log(AJUDA);
      console.log(`\nCliente simulado: ${telefone}. Escreva como se fosse o cliente.\n`);

      leitor.setPrompt("cliente> ");
      leitor.prompt();

      // Uma linha por vez, para o transcrito não embaralhar quando a entrada
      // vem de um arquivo (teste automatizado) em vez de digitada.
      let emAndamento: Promise<void> = Promise.resolve();

      const tratar = async (linha: string): Promise<void> => {
        if (!comando(linha)) {
          const mensagem: MensagemRecebida = {
            telefone,
            texto: linha,
            midia,
            recebidaEm: agora(),
          };
          midia = null;
          await aoReceber(mensagem);
        }
        if (!fechado) leitor?.prompt();
      };

      leitor.on("close", () => {
        fechado = true;
      });

      leitor.on("line", (linha) => {
        emAndamento = emAndamento.then(() => tratar(linha));
      });

      await new Promise<void>((resolve) => leitor?.on("close", resolve));
      await emAndamento;
      console.log("\nAté logo!");
    },

    async enviar(_telefone, texto) {
      console.log(`\nbot> ${texto.replace(/\n/g, "\n     ")}\n`);
    },

    async parar() {
      leitor?.close();
    },
  };
}
