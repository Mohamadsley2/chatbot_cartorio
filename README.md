# Chatbot do Cartório de Protestos

Bot de atendimento por WhatsApp que **coleta os dados antes do atendimento**, separa as
solicitações em pastas por tipo e informa ao cliente o número dele na fila do dia.
O bot **não consulta nada** — por LGPD, quem verifica protesto, CPF e CNPJ é sempre a
atendente. A especificação completa está em [src/spec_chatbot_cartorio.md](src/spec_chatbot_cartorio.md).

## Como rodar

```bash
npm install
npm run dev       # abre o simulador de conversa no terminal
npm run painel    # imprime a fila do dia (visão da atendente)
npm run demo      # roda um roteiro pronto com os 4 fluxos principais
npm run whatsapp  # liga no WhatsApp de verdade (API oficial da Meta)
npm run checar    # verifica os tipos (TypeScript)
```

O simulador conversa igual ao WhatsApp, mas pelo terminal — serve para o cartório revisar
as perguntas e as respostas antes de ligar em produção. Ele aceita comandos de teste:

| Comando | Para que serve |
|---|---|
| `/fila` | mostra a fila do dia como a atendente veria |
| `/foto` e `/pdf` | simulam o envio de um comprovante |
| `/hora 17:00` | finge que agora são 17:00 (testar fora do horário) |
| `/data 22/08/2026` | finge outro dia (sábado, feriado) |
| `/telefone 5551…` | troca o cliente simulado, para encher a fila |
| `/reset` | esquece a sessão do cliente atual |

## Estrutura

```
src/
  config.ts          horário, prazos de certidão, timeout — o que o cartório ajusta
  mensagens.ts       todo texto que o cliente lê (para revisão do cartório)
  types.ts           tipos compartilhados
  core/
    motor.ts         o cérebro: mensagem recebida -> respostas a enviar
    fluxos.ts        as perguntas de cada opção do menu, em ordem
    validadores.ts   formato de CPF/CNPJ, nome, valor, data
    horario.ts       horário de atendimento no fuso do cartório
  queue/
    gerenciadorFila.ts  numeração geral do dia, reiniciada a cada dia
    persistencia.ts     grava a fila em JSON e em CSV por dia
  bot/
    gerenciadorDeSessao.ts  onde cada cliente parou na conversa
  adapters/
    tipos.ts         contrato de qualquer integração de WhatsApp
    simulador.ts     integração de teste, pelo terminal
    metaCloud.ts     integração com a API oficial da Meta (webhook + envio)
  painel.ts          fila do dia formatada para a atendente
dados/               gerado ao rodar: fila-atual.json e solicitacoes-AAAA-MM-DD.csv
```

O `motor.ts` não sabe o que é WhatsApp: ele recebe uma mensagem e devolve textos. Trocar de
plataforma é escrever um adaptador novo em `src/adapters/`, sem tocar em nenhuma regra de
atendimento.

## O que já está decidido (grupo, 14/05)

- Atendimento por WhatsApp de **segunda a sexta, 9h00 às 16h30**. Fora disso o bot informa o
  horário e **não** gera número de fila.
- Número de fila **geral** (não por opção) e **reiniciado todo dia**.
- Certidão: **5, 10 ou 15 anos**.
- PIX é **sempre** para a conta do cartório.
- Não é necessário voltar ao menu no meio do fluxo.
- CPF/CNPJ têm o formato validado antes de entrar na fila (contagem de dígitos + dígito
  verificador, que é cálculo local, sem consulta a base nenhuma).

## O que falta decidir para entrar em produção

### 1. Plataforma de WhatsApp — é o único bloqueio real

O ponto que a Larissa precisa confirmar: **qual serviço de WhatsApp Business o cartório usa
hoje**. Isso muda o caminho, porque existe um detalhe importante:

> Um número que vai para a **API oficial do WhatsApp (Meta Cloud API)** deixa de funcionar no
> aplicativo WhatsApp Business e no WhatsApp Web comum. As atendentes passariam a responder
> por uma caixa de entrada de outro sistema.

Como as atendentes hoje atendem pelo **celular delas e pelo WhatsApp Web** nos computadores,
há três caminhos:

| Caminho | Como fica o atendimento | Prazo | Risco |
|---|---|---|---|
| **A. API oficial (Meta Cloud API)** em um **número novo** só do bot | O número atual continua exatamente como é hoje. O bot atende no número novo e a atendente responde por um painel web | 2 a 3 semanas (verificação da empresa na Meta) | Baixo |
| **B. Provedor via WhatsApp Web (Z-API, Evolution)** no número atual | Nada muda para as atendentes: celular e WhatsApp Web seguem funcionando, o bot entra em paralelo | Dias | Não é oficial; existe risco de a Meta bloquear o número |
| **C. API oficial no número atual** | As atendentes perdem o app e o WhatsApp Web, e passam a usar só o painel | 2 a 3 semanas | Baixo, mas muda a rotina delas |

Recomendação: **A**, se der para esperar duas ou três semanas — mantém a rotina atual intacta
e é oficial. Se a ideia é começar já esta semana, **B** funciona como piloto (com um chip
separado, para não arriscar o número principal do cartório).

O código para os caminhos **A e C já está pronto** (`src/adapters/metaCloud.ts`): recebe o
webhook da Meta com verificação de assinatura, evita mensagem repetida, baixa os comprovantes
e responde pela Graph API. Falta só a conta na Meta e a decisão de qual número usar. O caminho
**B** exigiria um adaptador novo para o provedor escolhido — mesmo contrato
`AdaptadorWhatsApp`, sem mexer em nenhuma regra de atendimento.

### Ligar no WhatsApp de verdade (caminho A ou C)

1. `cp .env.exemplo .env` e preencher com os dados do painel da Meta (o `.env` não vai para o
   Git).
2. Publicar o bot num endereço HTTPS acessível pela Meta — hospedagem própria ou um túnel
   (`cloudflared`, `ngrok`) durante os testes.
3. No painel da Meta, cadastrar o webhook apontando para `https://SEU-ENDERECO/webhook`, com o
   mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`, e assinar o campo **messages**.
4. `npm run whatsapp`. O `GET /saude` responde `ok` e serve para monitoramento.

O detalhe de cada tela do painel da Meta (token permanente, App Secret, verificação do CNPJ,
o que fazer quando não chega mensagem) está em [INTEGRACAO-META.md](INTEGRACAO-META.md).

Enquanto o bot só responde a quem escreveu primeiro (é o caso aqui), as conversas entram como
*service conversation* na janela de 24h, sem custo de template por mensagem.

### 2. Outras pendências

- **Como as atendentes vão ver as pastas.** Hoje o projeto entrega a fila em CSV (abre no
  Excel), em JSON e num painel de terminal. Se ajudar, o próximo passo é uma tela web simples
  com as pastas por categoria e o botão de "atendido".
- **Prazo máximo de certidão** — existe acima de 15 anos? (Larissa)
- **Feriados** do cartório, para não abrir fila nesses dias (`config.atendimento.feriados`).
- **Nome oficial do cartório** para a mensagem de boas-vindas (`config.nomeCartorio`).

## Privacidade

Os dados coletados ficam apenas na máquina que roda o bot, na pasta `dados/` (que não vai
para o Git). O bot não envia nada para fora e não consulta nenhuma base — ele só organiza o
que o cliente digitou para a atendente atender mais rápido.
