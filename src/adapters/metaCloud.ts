// Adaptador da WhatsApp Cloud API — a API oficial da Meta.
//
// São duas metades independentes:
//   1. Receber: a Meta faz POST no nosso webhook a cada mensagem do cliente.
//   2. Enviar:  fazemos POST em graph.facebook.com para responder.
//
// Nenhuma regra de atendimento vive aqui. Este arquivo só traduz o formato da
// Meta para `MensagemRecebida` e devolve texto — quem decide o que responder
// continua sendo o motor.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import type { MensagemRecebida, Midia } from "../types.js";
import type { AdaptadorWhatsApp } from "./tipos.js";

// Segredos não ficam em config.ts (que vai para o git): vêm do ambiente.
interface Credenciais {
  token: string; // token do usuário de sistema (permanente)
  idNumero: string; // Phone number ID do número do cartório
  tokenVerificacao: string; // string que nós inventamos, usada só no handshake
  segredoApp: string; // App secret; valida que o POST veio mesmo da Meta
}

function lerCredenciais(): Credenciais {
  const faltando: string[] = [];
  const ler = (nome: string): string => {
    const valor = process.env[nome]?.trim();
    if (!valor) {
      faltando.push(nome);
      return "";
    }
    return valor;
  };

  const credenciais: Credenciais = {
    token: ler("WHATSAPP_TOKEN"),
    idNumero: ler("WHATSAPP_PHONE_NUMBER_ID"),
    tokenVerificacao: ler("WHATSAPP_VERIFY_TOKEN"),
    segredoApp: ler("WHATSAPP_APP_SECRET"),
  };

  if (faltando.length > 0) {
    throw new Error(
      `Faltam variáveis de ambiente: ${faltando.join(", ")}.\n` +
        "Copie .env.exemplo para .env e preencha com os dados do painel da Meta.",
    );
  }
  return credenciais;
}

// --- Formato do webhook da Meta (só os campos que usamos) -------------------

interface MidiaDaMeta {
  id: string;
  mime_type?: string;
  filename?: string;
  caption?: string;
}

interface MensagemDaMeta {
  id: string;
  from: string; // wa_id do cliente, ex: "555199990001"
  timestamp: string; // segundos desde 1970, como texto
  type: string; // text, image, document, audio, button, interactive...
  text?: { body: string };
  image?: MidiaDaMeta;
  document?: MidiaDaMeta;
  audio?: MidiaDaMeta;
  video?: MidiaDaMeta;
  sticker?: MidiaDaMeta;
  button?: { text?: string };
  interactive?: {
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
}

interface CorpoWebhook {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: MensagemDaMeta[];
        // `statuses` (entregue/lido) também chega aqui; não nos interessa.
      };
    }>;
  }>;
}

const EXTENSOES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export function criarAdaptadorMeta(): AdaptadorWhatsApp {
  const credenciais = lerCredenciais();
  const { versaoApi, porta, caminhoWebhook, marcarComoLida, baixarMidias } = config.meta;
  const base = `https://graph.facebook.com/${versaoApi}`;
  const cabecalhoAuth = { Authorization: `Bearer ${credenciais.token}` };

  let servidor: Server | null = null;

  // A Meta reenvia o mesmo webhook quando desconfia que não chegou. Sem esta
  // trava, uma mensagem repetida avançaria o fluxo duas vezes.
  const vistas = new Set<string>();
  const ordemVistas: string[] = [];
  const jaVista = (id: string): boolean => {
    if (vistas.has(id)) return true;
    vistas.add(id);
    ordemVistas.push(id);
    if (ordemVistas.length > 500) {
      const antiga = ordemVistas.shift();
      if (antiga) vistas.delete(antiga);
    }
    return false;
  };

  // Uma mensagem por vez: a sessão é estado por telefone, e duas mensagens
  // processadas em paralelo embaralhariam o passo em que o cliente está.
  let fila: Promise<void> = Promise.resolve();

  const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  // Uma chamada à Graph API, com retentativa em erro temporário (429 / 5xx).
  const chamarApi = async (caminho: string, corpo: unknown): Promise<void> => {
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      const resposta = await fetch(`${base}/${caminho}`, {
        method: "POST",
        headers: { ...cabecalhoAuth, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (resposta.ok) return;

      const detalhe = await resposta.text();
      const temporario = resposta.status === 429 || resposta.status >= 500;
      if (!temporario || tentativa === 3) {
        throw new Error(`Meta respondeu ${resposta.status}: ${detalhe}`);
      }
      await esperar(500 * tentativa);
    }
  };

  // O nome do arquivo é escolhido por quem envia, então não pode ir direto para
  // o disco: barra e ponto-ponto sairiam da pasta, e dois clientes mandando
  // "comprovante.pdf" no mesmo dia sobrescreveriam um ao outro. Por isso
  // limpamos os caracteres e prefixamos com telefone e id da mídia.
  const nomeDeArquivoSeguro = (
    enviado: string | undefined,
    telefone: string,
    id: string,
    extensao: string,
  ): string => {
    const limpar = (texto: string): string => texto.replace(/[^\p{L}\p{N}._-]/gu, "_").replace(/^[.]+/, "");
    const prefixo = `${limpar(telefone)}-${limpar(id)}`.slice(0, 60);
    const original = limpar(enviado ?? "").slice(-60);
    return original ? `${prefixo}-${original}` : `${prefixo}${extensao}`;
  };

  // Baixar mídia tem dois passos: pegar a URL temporária e então o arquivo.
  // A URL expira em poucos minutos e as duas chamadas exigem o token.
  const salvarMidia = async (midia: MidiaDaMeta, telefone: string): Promise<string> => {
    const infoResposta = await fetch(`${base}/${midia.id}`, { headers: cabecalhoAuth });
    if (!infoResposta.ok) throw new Error(`não consegui a URL da mídia (${infoResposta.status})`);
    const info = (await infoResposta.json()) as { url?: string; mime_type?: string };
    if (!info.url) throw new Error("resposta da mídia sem URL");

    const arquivoResposta = await fetch(info.url, { headers: cabecalhoAuth });
    if (!arquivoResposta.ok) throw new Error(`download da mídia falhou (${arquivoResposta.status})`);
    const bytes = Buffer.from(await arquivoResposta.arrayBuffer());

    const tipoMime = (midia.mime_type ?? info.mime_type ?? "").split(";")[0] ?? "";
    const extensao = EXTENSOES[tipoMime] ?? ".bin";
    const nome = nomeDeArquivoSeguro(midia.filename, telefone, midia.id, extensao);
    const pasta = join(config.persistencia.pasta, config.meta.pastaMidias);
    await mkdir(pasta, { recursive: true });
    await writeFile(join(pasta, nome), bytes);
    return nome;
  };

  const converterMidia = async (msg: MensagemDaMeta): Promise<Midia | null> => {
    const candidatos: Array<[Midia["tipo"], MidiaDaMeta | undefined]> = [
      ["imagem", msg.image],
      ["documento", msg.document],
      ["outro", msg.audio],
      ["outro", msg.video],
      ["outro", msg.sticker],
    ];
    const achado = candidatos.find(([, dados]) => dados !== undefined);
    if (!achado) return null;

    const [tipo, dados] = achado;
    if (!dados) return null;

    let nomeArquivo = dados.filename ?? `${msg.type}-${dados.id}`;
    if (baixarMidias) {
      try {
        // Guardamos o arquivo porque um número na Cloud API não tem caixa de
        // entrada: sem baixar, a atendente não teria como ver o comprovante.
        nomeArquivo = await salvarMidia(dados, msg.from);
      } catch (erro) {
        console.error(`[meta] não consegui baixar a mídia de ${msg.from}:`, erro);
      }
    }
    return { tipo, nomeArquivo };
  };

  const converter = async (msg: MensagemDaMeta): Promise<MensagemRecebida> => {
    const texto =
      msg.text?.body ??
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      msg.button?.text ??
      msg.image?.caption ??
      msg.document?.caption ??
      "";

    const segundos = Number(msg.timestamp);
    return {
      telefone: msg.from,
      texto,
      midia: await converterMidia(msg),
      recebidaEm: Number.isFinite(segundos) ? new Date(segundos * 1000) : new Date(),
    };
  };

  const extrairMensagens = (bruto: Buffer): MensagemDaMeta[] => {
    let corpo: CorpoWebhook;
    try {
      corpo = JSON.parse(bruto.toString("utf8")) as CorpoWebhook;
    } catch {
      return [];
    }
    return (corpo.entry ?? [])
      .flatMap((entrada) => entrada.changes ?? [])
      .flatMap((mudanca) => mudanca.value?.messages ?? [])
      .filter((msg) => typeof msg?.id === "string" && typeof msg?.from === "string");
  };

  // Confere o HMAC do corpo cru com o App Secret: garante que o POST veio da
  // Meta, e não de alguém que descobriu a URL do webhook.
  // O cabeçalho pode vir repetido (array) — nesse caso recusamos, a Meta manda um só.
  const assinaturaValida = (cabecalho: string | string[] | undefined, corpo: Buffer): boolean => {
    if (typeof cabecalho !== "string" || !cabecalho.startsWith("sha256=")) return false;
    const esperado = createHmac("sha256", credenciais.segredoApp).update(corpo).digest();
    const recebido = Buffer.from(cabecalho.slice("sha256=".length), "hex");
    if (recebido.length !== esperado.length) return false;
    return timingSafeEqual(recebido, esperado);
  };

  const lerCorpo = async (req: IncomingMessage): Promise<Buffer> => {
    const partes: Buffer[] = [];
    let tamanho = 0;
    for await (const parte of req) {
      const bloco = parte as Buffer;
      tamanho += bloco.length;
      if (tamanho > 1_000_000) throw new Error("corpo do webhook maior que 1 MB");
      partes.push(bloco);
    }
    return Buffer.concat(partes);
  };

  const processar = async (
    msg: MensagemDaMeta,
    aoReceber: (m: MensagemRecebida) => Promise<void>,
  ): Promise<void> => {
    if (jaVista(msg.id)) return;
    try {
      if (marcarComoLida) {
        await chamarApi(`${credenciais.idNumero}/messages`, {
          messaging_product: "whatsapp",
          status: "read",
          message_id: msg.id,
        }).catch((erro) => console.error("[meta] falha ao marcar como lida:", erro));
      }
      await aoReceber(await converter(msg));
    } catch (erro) {
      // Já respondemos 200 à Meta, então o erro morre aqui: registra e segue.
      console.error(`[meta] falha ao tratar a mensagem ${msg.id}:`, erro);
    }
  };

  const tratar = async (
    req: IncomingMessage,
    res: ServerResponse,
    aoReceber: (m: MensagemRecebida) => Promise<void>,
  ): Promise<void> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Handshake: a Meta chama uma vez, quando salvamos a URL no painel.
    if (req.method === "GET" && url.pathname === caminhoWebhook) {
      const modo = url.searchParams.get("hub.mode");
      const enviado = url.searchParams.get("hub.verify_token");
      if (modo === "subscribe" && enviado === credenciais.tokenVerificacao) {
        // Texto puro, sem JSON: a Meta compara o corpo com o desafio.
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(url.searchParams.get("hub.challenge") ?? "");
      } else {
        console.error("[meta] handshake recusado: WHATSAPP_VERIFY_TOKEN diferente do painel");
        res.writeHead(403).end();
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/saude") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }

    if (req.method !== "POST" || url.pathname !== caminhoWebhook) {
      res.writeHead(404).end();
      return;
    }

    let bruto: Buffer;
    try {
      bruto = await lerCorpo(req);
    } catch {
      res.writeHead(413).end();
      return;
    }

    if (!assinaturaValida(req.headers["x-hub-signature-256"], bruto)) {
      console.error("[meta] assinatura inválida — confira WHATSAPP_APP_SECRET");
      res.writeHead(401).end();
      return;
    }

    // Responde já: se demorarmos, a Meta considera falha e reenvia o webhook.
    res.writeHead(200).end();

    const mensagens = extrairMensagens(bruto);
    fila = fila.then(async () => {
      for (const msg of mensagens) await processar(msg, aoReceber);
    });
  };

  return {
    nome: "meta-cloud-api",

    async iniciar(aoReceber) {
      const instancia = createServer((req, res) => {
        void tratar(req, res, aoReceber).catch((erro) => {
          console.error("[meta] erro inesperado no webhook:", erro);
          if (!res.headersSent) res.writeHead(500).end();
        });
      });
      servidor = instancia;

      await new Promise<void>((resolve) => instancia.listen(porta, resolve));
      console.log(`[meta] webhook ouvindo em http://localhost:${porta}${caminhoWebhook}`);
      console.log(`[meta] número ${credenciais.idNumero} · Graph API ${versaoApi}`);

      // Só termina quando o servidor fechar (mesmo contrato do simulador).
      await new Promise<void>((resolve) => instancia.on("close", resolve));
    },

    async enviar(telefone, texto) {
      // Resposta livre, permitida na janela de 24h após a mensagem do cliente.
      // Como o bot só fala quando é chamado, nunca precisamos de template pago.
      await chamarApi(`${credenciais.idNumero}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: telefone,
        type: "text",
        text: { preview_url: false, body: texto },
      });
    },

    async parar() {
      servidor?.close();
      servidor = null;
    },
  };
}
