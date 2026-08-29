// Tudo que o cartório pode querer ajustar sem mexer na lógica do bot fica aqui.

export interface ConfigAtendimento {
  diasDaSemana: number[]; // 0 = domingo ... 6 = sábado
  inicio: string; // "HH:MM"
  fim: string; // "HH:MM"
  feriados: string[]; // "YYYY-MM-DD" (data única) ou "MM-DD" (feriado fixo todo ano)
}

export interface ConfigMeta {
  versaoApi: string; // versão da Graph API, ex: "v23.0"
  porta: number; // porta local onde o webhook escuta
  caminhoWebhook: string; // precisa ser o mesmo caminho cadastrado no painel
  marcarComoLida: boolean; // mostra ao cliente que a mensagem foi lida
  baixarMidias: boolean; // salva comprovantes recebidos em disco
  pastaMidias: string; // subpasta dentro de persistencia.pasta
}

export interface Config {
  nomeCartorio: string;
  fusoHorario: string;
  atendimento: ConfigAtendimento;
  sessao: { timeoutMinutos: number; maxTentativas: number };
  certidao: { prazosAnos: number[]; permitirOutroPrazo: boolean };
  documento: { validarDigitoVerificador: boolean };
  persistencia: { pasta: string };
  meta: ConfigMeta;
}

export const config: Config = {
  nomeCartorio: "Cartório de Protestos",
  fusoHorario: "America/Sao_Paulo",

  // Decidido em 14/05: atendimento via WhatsApp das 9:00 às 16:30, dias úteis.
  atendimento: {
    diasDaSemana: [1, 2, 3, 4, 5],
    inicio: "09:00",
    fim: "16:30",
    feriados: [],
  },

  sessao: {
    timeoutMinutos: 10,
    maxTentativas: 3,
  },

  // Decidido em 14/05: prazos de 5, 10 e 15 anos.
  // Pendente com a Larissa: existe prazo maior que 15 anos? Se sim, basta
  // acrescentar aqui ou ligar `permitirOutroPrazo`.
  certidao: {
    prazosAnos: [5, 10, 15],
    permitirOutroPrazo: false,
  },

  // Confere os dígitos verificadores do CPF/CNPJ. É cálculo local, não é
  // consulta a nenhuma base — serve só para pegar erro de digitação.
  documento: {
    validarDigitoVerificador: true,
  },

  persistencia: {
    pasta: "dados",
  },

  // Integração com a WhatsApp Cloud API. Os segredos (token, App Secret, IDs)
  // NÃO ficam aqui — vêm do arquivo .env, que não vai para o git.
  meta: {
    versaoApi: "v23.0",
    porta: Number(process.env.PORT ?? 3000),
    caminhoWebhook: "/webhook",
    marcarComoLida: true,
    baixarMidias: true,
    pastaMidias: "midias",
  },
};
