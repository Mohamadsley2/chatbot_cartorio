import type { MensagemRecebida } from "../types.js";

// Contrato que qualquer integração de WhatsApp precisa cumprir. O núcleo do bot
// só conhece esta interface, então trocar de plataforma (Cloud API, Z-API,
// Twilio, Baileys...) não mexe em nenhuma regra de atendimento.
export interface AdaptadorWhatsApp {
  nome: string;
  iniciar(aoReceber: (msg: MensagemRecebida) => Promise<void>): Promise<void>;
  enviar(telefone: string, texto: string): Promise<void>;
  parar(): Promise<void>;
}
