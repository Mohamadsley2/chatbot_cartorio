# Especificação do chatbot de WhatsApp — Cartório de Protestos

> Atualizado em 19/08/2026 com as decisões do grupo (mensagens de 14/05).
> Itens ainda em aberto estão listados no final.

## Visão geral

Bot de atendimento via WhatsApp para um cartório de notas e protestos. O objetivo do bot **não é automatizar consultas** — por exigência da LGPD, toda verificação de dados cadastrais e protestos é feita manualmente pelos atendentes. O bot serve para:

1. **Coletar os dados necessários** do cliente antes do atendimento (CPF/CNPJ, nome, tipo de solicitação, informações complementares).
2. **Organizar e filtrar as solicitações por categoria**, gerando uma pasta separada por tipo de requerimento para que as atendentes consigam atender com mais agilidade.
3. **Posicionar o cliente na fila** e informar seu número de espera.

---

## Premissas técnicas e operacionais

- Nenhuma consulta automatizada a sistemas externos será realizada pelo bot.
- Todo acesso a dados de protestos, CPFs e CNPJs é feito manualmente pelas atendentes após receberem as informações coletadas pelo bot.
- O bot valida apenas o **formato** dos dados (quantidade de dígitos e dígito verificador do CPF/CNPJ, que é cálculo local), nunca o conteúdo.
- As solicitações são separadas em categorias ("pastas") para facilitar o trabalho das atendentes.
- **A numeração da fila é geral, não por categoria** (decidido em 14/05): o número serve para o cliente saber quantas pessoas estão na frente dele.
- **A numeração reinicia todos os dias** (decidido em 14/05).
- Fora do horário de atendimento, o bot informa o horário de funcionamento e **não** posiciona o cliente em fila.
- **Não há necessidade de voltar ao menu principal** (decidido em 14/05) — os fluxos são curtos. Ainda assim o bot entende as palavras `menu`, `voltar` e `cancelar` em qualquer etapa, sem anunciá-las, para quem entrar na opção errada.

---

## Horário de atendimento

**Definido em 14/05: segunda a sexta, das 9h00 às 16h30.**

O horário mais curto que o do balcão é intencional: dá tempo de responder as mensagens do dia e não acumular pendências para o dia seguinte.

Mensagem fora do horário:
> "Olá! Nosso atendimento via WhatsApp é de segunda a sexta, das 9h às 16h30.
>
> Sua mensagem foi recebida fora desse horário, então ainda não entramos na fila de atendimento. Por favor, envie sua mensagem novamente no próximo dia útil dentro do horário e teremos prazer em atendê-lo."

Fins de semana e feriados também ficam fora do horário (a lista de feriados é configurável).

---

## Menu principal

Mensagem de boas-vindas:
> "Olá! Bem-vindo ao cartório [nome]. Como podemos ajudar? Digite o número da opção desejada:"

```
1 – Consulta de protesto
2 – Cancelamento de protesto
3 – Pagamento de protesto
4 – Enviar comprovante de PIX
5 – Certidão de protesto
0 – Falar com atendente
```

---

## Fluxos por opção

### Opção 1 — Consulta de protesto
**Categoria de fila:** `consulta-protesto`

1. "Por favor, informe seu CPF ou CNPJ (somente números):"
   - Valida formato (11 dígitos = CPF / 14 dígitos = CNPJ) e dígito verificador.
2. "Informe seu nome completo:"
3. Confirmação e fila.

---

### Opção 2 — Cancelamento de protesto
**Categoria de fila:** `cancelamento-protesto`

1. CPF/CNPJ.
2. Nome completo.
3. Confirmação e fila.

---

### Opção 3 — Pagamento de protesto
**Categoria de fila:** `pagamento-protesto`

1. CPF/CNPJ.
2. Nome completo.
3. Confirmação e fila — a atendente entra em contato com o valor atualizado e a chave PIX do cartório.

> O bot avisa que, depois de pagar, o cliente pode enviar o comprovante pela **opção 4**.

---

### Opção 4 — Enviar comprovante de PIX
**Categoria de fila:** `comprovante-pix`

O PIX é **sempre para a conta do cartório** (confirmado em 14/05), então o fluxo não pergunta para quem foi pago.

1. "Informe o CPF ou CNPJ do devedor (somente números):"
2. "Informe o nome completo do devedor:"
3. "Informe o valor pago (ex: 350,00):"
4. "Informe a data do pagamento (ex: 14/05/2026):"
5. "Agora envie o comprovante de PIX como imagem ou PDF:"
6. Confirmação, protocolo e fila.

---

### Opção 5 — Certidão de protesto
**Categoria de fila:** `certidao-protesto`

1. CPF/CNPJ para emissão.
2. Nome completo da pessoa para a certidão.
3. "A certidão será digital ou física?"
   ```
   1 – Digital
   2 – Física
   ```
4. "Qual o período da certidão?" (definido em 14/05)
   ```
   1 –  5 anos
   2 – 10 anos
   3 – 15 anos
   ```
5. Confirmação e fila, repetindo formato e período escolhidos.

> Se existir prazo maior que 15 anos, basta acrescentar na configuração — o bot monta a lista de opções a partir dela. **Pendente com a Larissa.**

---

### Opção 0 — Falar com atendente
**Categoria de fila:** `atendimento-geral`

1. "Por favor, informe seu nome completo:"
2. "Em poucas palavras, como podemos ajudar?"
3. Confirmação e fila.

---

## Tratamento de erros e casos especiais

| Situação | Comportamento |
|---|---|
| Dado inválido (CPF com letras, dígitos errados, data futura, valor inválido) | Bot informa o erro e pede nova entrada, até 3 tentativas. |
| 3ª tentativa inválida | O cliente entra na fila **da própria categoria** com a observação de qual dado faltou e o que ele digitou, para a atendente terminar a coleta manualmente. |
| Cliente digita `menu`, `voltar` ou `cancelar` | Volta ao menu principal, descartando o que havia sido coletado. |
| Cliente digita opção inexistente no menu | "Não entendi. Por favor, escolha uma das opções disponíveis (1 a 5, ou 0 para falar com atendente)." |
| Fora do horário de atendimento | Exibe horário de funcionamento. Não gera número de fila e descarta a conversa em andamento. |
| Cliente envia imagem/PDF onde se espera texto | Bot pede para responder por texto. |
| Cliente inativo por mais de 10 minutos em meio a um fluxo | Avisa que o atendimento foi encerrado por inatividade, descarta os dados e mostra o menu novamente. |

---

## Estrutura de categorias (pastas das atendentes)

| Categoria | Origem |
|---|---|
| `consulta-protesto` | Opção 1 |
| `cancelamento-protesto` | Opção 2 |
| `pagamento-protesto` | Opção 3 |
| `comprovante-pix` | Opção 4 |
| `certidao-protesto` | Opção 5 |
| `atendimento-geral` | Opção 0 |

Cada entrada na fila contém:
- Número da fila geral do dia e protocolo (ex: `2026-08-19-007`)
- Categoria
- Nome do cliente
- CPF/CNPJ informado
- Telefone
- Dados complementares conforme o fluxo (com rótulos legíveis)
- Data e hora da entrada na fila

A fila do dia é gravada em `dados/fila-atual.json` e também em `dados/solicitacoes-AAAA-MM-DD.csv` (planilha que abre direto no Excel).

---

## Pontos ainda em aberto

1. **Plataforma de WhatsApp Business** — é a decisão que falta para colocar em produção. A integração com a API oficial da Meta já está implementada; falta a conta na Meta e definir se o bot usa um número novo ou o número atual do cartório (o número atual, na API oficial, deixa de funcionar no app e no WhatsApp Web). Comparação dos caminhos no [README](../README.md).
2. **Como as atendentes vão ver as pastas** — hoje o projeto entrega a fila em CSV/JSON e um painel de terminal. Se elas continuarem no WhatsApp Web + celular, vale avaliar uma tela simples de painel.
3. **Prazo máximo de certidão** — existe opção acima de 15 anos? (Larissa)
4. **Lista de feriados** do cartório, para o bot não abrir fila nesses dias.
5. **Nome oficial do cartório** para a mensagem de boas-vindas.
