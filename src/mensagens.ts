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

  foraDoHorario: (): string =>
    `Olá! Nosso atendimento via WhatsApp é ${horarioTexto()}.\n\n` +
    "Sua mensagem foi recebida fora desse horário, então ainda não entramos na fila de atendimento. " +
    "Por favor, envie sua mensagem novamente no próximo dia útil dentro do horário e teremos prazer em atendê-lo.",

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
