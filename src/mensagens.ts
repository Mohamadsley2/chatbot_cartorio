// Todo texto que o cliente lê está neste arquivo, para o cartório poder revisar
// e ajustar as palavras sem mexer na lógica.
import { config } from "./config.js";

const OPCOES_MENU = [
  "1 – Consulta de protesto",
  "2 – Cancelamento de protesto",
  "3 – Pagamento de protesto",
  "4 – Enviar comprovante de PIX",
  "5 – Certidão de protesto",
  "0 – Falar com atendente",
];

// "09:00" -> "9h", "16:30" -> "16h30"
function formatarHora(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

function horarioTexto(): string {
  const { inicio, fim } = config.atendimento;
  return `de segunda a sexta, das ${formatarHora(inicio)} às ${formatarHora(fim)}`;
}

export const mensagens = {
  saudacao: (): string => `Olá! Bem-vindo ao ${config.nomeCartorio}.`,

  menu: (): string => `Como podemos ajudar? Digite o número da opção desejada:\n\n${OPCOES_MENU.join("\n")}`,

  opcaoInvalida: (): string =>
    "Não entendi. Por favor, escolha uma das opções disponíveis (1 a 5, ou 0 para falar com atendente).",

  // Não bloqueia mais o atendimento — só avisa, depois de coletar e enfileirar,
  // que a resposta vem só no próximo dia útil. Ver ARQUITETURA.md (decisão que
  // substituiu o ADR-009).
  foraDoHorarioAvisoFila: (diaUtilBR: string): string =>
    `Você escreveu fora do nosso horário oficial de atendimento (${horarioTexto()}). ` +
    `Sua solicitação foi registrada normalmente, mas só será atendida no próximo dia útil, ${diaUtilBR}.`,

  inatividade: (): string =>
    `Como ficamos ${config.sessao.timeoutMinutos} minutos sem resposta, encerrei o atendimento anterior e os dados foram descartados. Vamos começar de novo.`,

  respondaComTexto: (): string => "Preciso que você responda essa pergunta digitando o texto, por favor.",

  aguardandoComprovante: (): string =>
    "Não recebi nenhum arquivo. Envie o comprovante de PIX como imagem ou PDF, por favor.",

  encaminhandoParaAtendente: (): string =>
    "Sem problemas — vou te encaminhar direto para uma atendente, que vai continuar seu atendimento por aqui.",

  naFila: (numero: number, fecho = "Em breve uma atendente entrará em contato."): string =>
    `Você é o número *${numero}* na fila de atendimento de hoje. ${fecho}`,
};
