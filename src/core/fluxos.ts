import { config } from "../config.js";
import { mensagens } from "../mensagens.js";
import type { Categoria, Fluxo, Passo } from "../types.js";

// Passos que aparecem em vários fluxos.
const passoDocumento = (pergunta: string): Passo => ({
  chave: "documento",
  rotulo: "CPF/CNPJ",
  pergunta,
  tipo: "documento",
});

const passoNome = (pergunta: string, rotulo = "Nome"): Passo => ({
  chave: "nome",
  rotulo,
  pergunta,
  tipo: "nome",
});

function opcoesPrazoCertidao(): string[] {
  const prazos = config.certidao.prazosAnos.map((anos) => `${anos} anos`);
  return config.certidao.permitirOutroPrazo ? [...prazos, "Outro período"] : prazos;
}

// Monta o texto da pergunta de um passo de escolha, numerando as opções.
export function textoDaPergunta(passo: Passo): string {
  if (passo.tipo !== "opcoes" || !passo.opcoes) return passo.pergunta;
  const lista = passo.opcoes.map((opcao, indice) => `${indice + 1} – ${opcao}`).join("\n");
  return `${passo.pergunta}\n\n${lista}`;
}

export const fluxos: Record<Categoria, Fluxo> = {
  "consulta-protesto": {
    categoria: "consulta-protesto",
    titulo: "consulta de protesto",
    passos: [
      passoDocumento("Por favor, informe seu CPF ou CNPJ (somente números):"),
      passoNome("Informe seu nome completo:"),
    ],
    confirmacao: (s) =>
      `Obrigado, ${primeiroNome(s.nome)}! Sua solicitação de *consulta de protesto* foi registrada.\n\n${mensagens.naFila(s.numeroFila)}`,
  },

  "cancelamento-protesto": {
    categoria: "cancelamento-protesto",
    titulo: "cancelamento de protesto",
    passos: [
      passoDocumento("Por favor, informe seu CPF ou CNPJ (somente números):"),
      passoNome("Informe seu nome completo:"),
    ],
    confirmacao: (s) =>
      `Obrigado, ${primeiroNome(s.nome)}! Sua solicitação de *cancelamento de protesto* foi registrada.\n\n${mensagens.naFila(s.numeroFila)}`,
  },

  "pagamento-protesto": {
    categoria: "pagamento-protesto",
    titulo: "pagamento de protesto",
    passos: [
      passoDocumento("Por favor, informe seu CPF ou CNPJ (somente números):"),
      passoNome("Informe seu nome completo:"),
    ],
    confirmacao: (s) =>
      `Obrigado, ${primeiroNome(s.nome)}! Sua solicitação de *pagamento de protesto* foi registrada.\n\n` +
      `${mensagens.naFila(s.numeroFila, "A atendente vai entrar em contato com o valor atualizado e a chave PIX do cartório.")}\n\n` +
      "Depois de pagar, você pode enviar o comprovante pela *opção 4* do menu.",
  },

  // O PIX é sempre para a conta do cartório (confirmado em 14/05), por isso o
  // fluxo não pergunta para quem foi pago.
  "comprovante-pix": {
    categoria: "comprovante-pix",
    titulo: "comprovante de PIX",
    passos: [
      passoDocumento("Informe o CPF ou CNPJ do devedor (somente números):"),
      passoNome("Informe o nome completo do devedor:", "Nome do devedor"),
      { chave: "valor", rotulo: "Valor pago", pergunta: "Informe o valor pago (ex: 350,00):", tipo: "valor" },
      {
        chave: "dataPagamento",
        rotulo: "Data do pagamento",
        pergunta: "Informe a data do pagamento (ex: 14/05/2026):",
        tipo: "data",
      },
      {
        chave: "comprovante",
        rotulo: "Comprovante",
        pergunta: "Agora envie o comprovante de PIX como imagem ou PDF:",
        tipo: "midia",
      },
    ],
    confirmacao: (s) =>
      `Comprovante recebido! Sua solicitação foi registrada (protocolo ${s.protocolo}).\n\n` +
      `${mensagens.naFila(s.numeroFila, "Uma atendente irá confirmar o pagamento.")}`,
  },

  "certidao-protesto": {
    categoria: "certidao-protesto",
    titulo: "certidão de protesto",
    passos: [
      passoDocumento("Informe o CPF ou CNPJ para emissão da certidão (somente números):"),
      passoNome("Informe o nome completo da pessoa para a certidão:"),
      {
        chave: "formato",
        rotulo: "Formato",
        pergunta: "A certidão será digital ou física?",
        tipo: "opcoes",
        opcoes: ["Digital", "Física"],
      },
      {
        chave: "prazo",
        rotulo: "Período",
        pergunta: "Qual o período da certidão?",
        tipo: "opcoes",
        opcoes: opcoesPrazoCertidao(),
      },
      {
        chave: "prazoOutro",
        rotulo: "Período informado",
        pergunta: "Informe o número de anos desejado:",
        tipo: "texto",
        condicao: (dados) => dados.prazo === "Outro período",
      },
    ],
    confirmacao: (s) => {
      const periodo = s.dadosExtras.prazoOutro ? `${s.dadosExtras.prazoOutro} anos` : s.dadosExtras.prazo;
      return (
        `Obrigado, ${primeiroNome(s.nome)}! Sua solicitação de *certidão de protesto* ` +
        `(${s.dadosExtras.formato} / ${periodo}) foi registrada.\n\n${mensagens.naFila(s.numeroFila)}`
      );
    },
  },

  "atendimento-geral": {
    categoria: "atendimento-geral",
    titulo: "atendimento geral",
    passos: [
      passoNome("Por favor, informe seu nome completo:"),
      { chave: "assunto", rotulo: "Assunto", pergunta: "Em poucas palavras, como podemos ajudar?", tipo: "texto" },
    ],
    confirmacao: (s) => `Anotado, ${primeiroNome(s.nome)}! ${mensagens.naFila(s.numeroFila)}`,
  },
};

// Menu principal: número digitado -> categoria.
export const opcoesDoMenu: Record<string, Categoria> = {
  "1": "consulta-protesto",
  "2": "cancelamento-protesto",
  "3": "pagamento-protesto",
  "4": "comprovante-pix",
  "5": "certidao-protesto",
  "0": "atendimento-geral",
};

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}
