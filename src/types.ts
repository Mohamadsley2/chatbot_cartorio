export type Categoria = // os 6 tipos de fila válidos.
  | "consulta-protesto"
  | "cancelamento-protesto"
  | "pagamento-protesto"
  | "comprovante-pix"
  | "certidao-protesto"
  | "atendimento-geral";

export interface Solicitacao { // uma entrada completa na fila, depois que o cliente terminou o fluxo.
  protocolo: string; // ex: "2026-08-19-007"
  numeroFila: number; // posição na fila GERAL do dia (reiniciada todo dia)
  categoria: Categoria;
  telefone: string;
  nome: string;
  documento: string; // "" quando o fluxo não coleta documento
  dadosExtras: Record<string, string>;
  dataHora: Date;
}

export type NovaSolicitacao = Omit<Solicitacao, "protocolo" | "numeroFila" | "dataHora">;

export interface Sessao { // conversa em andamento, guarda onde o cliente está e o que já digitou.
  telefone: string;
  categoria: Categoria | null; // null = ainda escolhendo no menu
  indicePasso: number;
  dados: Record<string, string>;
  tentativas: number; // erros seguidos no passo atual
  ultimaAtividade: Date;
}

export interface Midia {
  tipo: "imagem" | "documento" | "outro";
  nomeArquivo: string;
}

export interface MensagemRecebida {
  telefone: string;
  texto: string;
  midia: Midia | null;
  recebidaEm: Date;
}

export type TipoPasso =
  | "documento" // CPF ou CNPJ (valida formato)
  | "nome" // nome completo
  | "texto" // texto livre
  | "valor" // valor em reais
  | "data" // data no formato dd/mm/aaaa
  | "opcoes" // escolha numerada
  | "midia"; // imagem ou PDF

export interface Passo {
  chave: string; // chave usada em Sessao.dados
  rotulo: string; // como aparece para a atendente
  pergunta: string;
  tipo: TipoPasso;
  opcoes?: string[]; // obrigatório quando tipo === "opcoes"
  condicao?: (dados: Record<string, string>) => boolean; // passo só é feito se retornar true
}

export interface Fluxo {
  categoria: Categoria;
  titulo: string;
  passos: Passo[];
  confirmacao: (solicitacao: Solicitacao) => string;
}
