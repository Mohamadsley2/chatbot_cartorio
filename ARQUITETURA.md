# Arquitetura e decisões — Chatbot do Cartório de Protestos

> Versão 1 — 29/08/2026. Documento vivo: toda decisão que mudar o formato do código
> entra aqui **antes** de virar commit.

## Para que serve este arquivo

Este documento responde **"por quê"**. Os outros três respondem outras perguntas, e
é bom não misturar:

| Arquivo | Pergunta que responde | Público |
|---|---|---|
| [README.md](README.md) | Como rodo isso? | quem vai executar |
| [src/spec_chatbot_cartorio.md](src/spec_chatbot_cartorio.md) | O que o bot fala e pergunta? | o cartório |
| [INTEGRACAO-META.md](INTEGRACAO-META.md) | Como ligo na Meta? | quem for publicar |
| **ARQUITETURA.md** (este) | **Por que o código é assim?** | quem for manter |

A partir de agora, **a lista de pendências mora só aqui** (seção "Pontos em aberto").
README e spec passam a apontar para cá, em vez de manter cópias que divergem.

## Como ler uma decisão (formato ADR)

ADR é *Architecture Decision Record*. Cada entrada abaixo tem quatro partes:

- **Contexto** — o que era verdade quando a decisão foi tomada.
- **Decisão** — o que foi escolhido.
- **Consequências** — o que ganhamos **e o que perdemos**. Esta parte é a que
  importa: uma decisão sem custo listado é uma decisão que ninguém pensou direito.
- **Status** — Aceita / Aceita com dívida / Substituída por outra.

O valor do formato está em conseguir, daqui a um ano, responder *"por que não usaram
um banco de dados?"* sem depender da memória de ninguém.

---

# Decisões tomadas

## ADR-001 — O núcleo do bot não conhece WhatsApp

**Contexto.** Durante meses a plataforma de WhatsApp esteve indefinida (Cloud API,
Z-API, Twilio). Se as regras de atendimento dependessem da plataforma, escolher
errado significaria reescrever tudo.

**Decisão.** O núcleo é uma função pura:
`processarMensagem(msg: MensagemRecebida): string[]` em
[src/core/motor.ts](src/core/motor.ts). Entra uma mensagem, saem textos. Quem fala
com a rede são os adaptadores, que cumprem o contrato `AdaptadorWhatsApp`
([src/adapters/tipos.ts](src/adapters/tipos.ts)): `iniciar`, `enviar`, `parar`.

**Consequências.**
- Ganho: trocar de plataforma é escrever um adaptador; nenhuma regra é tocada.
- Ganho: dá para testar todo o atendimento sem rede, sem WhatsApp e sem mocks.
- Ganho: o simulador de terminal e o WhatsApp real rodam exatamente o mesmo código.
- Custo: o núcleo é **síncrono**. Se um dia precisar consultar algo (um sistema do
  cartório, um CEP), a assinatura muda para `Promise<string[]>` e todos os chamadores
  mudam junto. Hoje isso é proibido por ADR-002, então o custo é teórico.
- Custo: o núcleo não sabe se a mensagem foi entregue — ele devolve texto e esquece.
  Erro de envio é problema do adaptador, e hoje ninguém avisa o cliente.

**Status.** Aceita.

## ADR-002 — O bot não consulta nada

**Contexto.** Exigência de LGPD levantada pelo cartório: acesso a dado de protesto,
CPF e CNPJ é ato do atendente, não pode ser automatizado.

**Decisão.** O bot coleta, valida formato e organiza. Nenhuma chamada a sistema
externo, nenhuma base consultada.

**Consequências.**
- Ganho: a superfície de risco de LGPD é pequena — o bot não *descobre* nada sobre
  ninguém, só recebe o que a pessoa digitou.
- Custo: o bot **não reduz trabalho de consulta**, reduz trabalho de digitação e de
  perguntar "me manda seu CPF" trinta vezes por dia. É importante que o cartório
  entenda isso, para não esperar do bot algo que ele nunca vai fazer.

**Status.** Aceita — é premissa do projeto, não está em negociação.

## ADR-003 — Validação apenas de formato, com dígito verificador local

**Contexto.** Erro de digitação em CPF gera retrabalho da atendente, mas conferir se
o CPF existe exigiria consulta — proibida por ADR-002.

**Decisão.** [src/core/validadores.ts](src/core/validadores.ts) confere contagem de
dígitos (11 = CPF, 14 = CNPJ) e calcula o dígito verificador. É aritmética local, não
consulta. Pode ser desligado em `config.documento.validarDigitoVerificador`.

**Consequências.**
- Ganho: pega a maioria dos erros de digitação antes de entrar na fila.
- Custo: um CPF **inexistente mas bem formado** passa. O bot valida sintaxe, não
  identidade — e nunca vai validar identidade.
- Custo: se o cliente digitar o CPF de outra pessoa, o bot aceita sem piscar.

**Status.** Aceita.

## ADR-004 — Fluxos declarativos, não código por fluxo

**Contexto.** As perguntas de cada opção do menu são revisadas pelo cartório e mudam.

**Decisão.** Cada fluxo é um array de `Passo`
([src/core/fluxos.ts](src/core/fluxos.ts)) com `chave`, `rotulo`, `pergunta`, `tipo`
e uma `condicao` opcional. O motor caminha pelo array e pula os passos cuja condição
não se aplica.

**Consequências.**
- Ganho: acrescentar uma pergunta é acrescentar um objeto, não escrever lógica.
- Ganho: o `rotulo` é reaproveitado no CSV da atendente — a mesma definição serve
  para perguntar e para exibir.
- Custo: **o fluxo é linear.** `condicao` só permite *pular* um passo; não existe
  ramificação de verdade ("se digital, siga por aqui; se física, por ali"). Se algum
  dia o cartório pedir um fluxo em árvore, este modelo não cobre e vai precisar
  mudar.

**Status.** Aceita, com limite conhecido.

## ADR-005 — Todo texto do cliente separado da lógica

**Contexto.** O cartório precisa revisar as palavras sem ler TypeScript.

**Decisão.** As mensagens genéricas ficam em [src/mensagens.ts](src/mensagens.ts).

**Consequências.**
- Ganho: revisar o tom do bot é ler um arquivo de 51 linhas.
- Custo — **dívida real:** as mensagens de confirmação de cada fluxo *não* estão lá,
  estão nas funções `confirmacao` de [src/core/fluxos.ts](src/core/fluxos.ts). Ou
  seja, o texto que o cliente lê está em **dois** lugares, e a promessa "todo texto
  em um arquivo" hoje é mentira.

**Status.** Aceita com dívida. Ver Aberto-11.

## ADR-006 — Estado em memória, um processo só

**Contexto.** Um cartório, volume de dezenas a poucas centenas de atendimentos por
dia. Um banco de dados seria mais infraestrutura do que o problema pede.

**Decisão.** As sessões vivem num `Map` de módulo
([src/bot/gerenciadorDeSessao.ts:4](src/bot/gerenciadorDeSessao.ts#L4)) e a fila numa
variável de módulo ([src/queue/gerenciadorFila.ts:5](src/queue/gerenciadorFila.ts#L5)).

**Consequências.**
- Ganho: zero dependência externa, zero configuração, leitura instantânea.
- Custo: **o bot não pode rodar em duas instâncias.** Duas cópias gerariam números de
  fila duplicados, porque cada uma teria seu próprio contador. Qualquer decisão de
  hospedagem que envolva réplicas quebra isso.
- Custo: **restart derruba conversas em andamento.** O cliente que estava no passo 3
  de uma certidão manda a resposta e recebe a saudação e o menu de volta, sem nenhuma
  explicação de que algo aconteceu. A fila, essa sobrevive — ela é lida do disco.
- Custo: sessões abandonadas só são removidas quando o cliente escreve de novo
  ([gerenciadorDeSessao.ts:19-24](src/bot/gerenciadorDeSessao.ts#L19-L24)). Quem some
  para sempre fica no `Map` até o próximo restart. Inofensivo neste volume, mas é
  memória que nunca é liberada sozinha.

**Status.** Aceita para o volume atual. Revisar quando Aberto-1 for decidido.

## ADR-007 — Persistência em arquivo, sem banco de dados

**Contexto.** A atendente precisa ver a fila, e o que ela já sabe usar é Excel.

**Decisão.** Duas gravações a cada solicitação
([src/queue/persistencia.ts](src/queue/persistencia.ts)): o estado do dia é reescrito
inteiro em `dados/fila-atual.json`, e uma linha é anexada a
`dados/solicitacoes-AAAA-MM-DD.csv` (com BOM, para o Excel abrir em UTF-8).

**Consequências.**
- Ganho: a atendente abre o CSV com dois cliques. Nada a instalar.
- Ganho: se o processo cair, a fila do dia volta do disco.
- Custo: **exige disco persistente de verdade.** Isso não é detalhe de deploy — é um
  requisito de arquitetura. Ver Aberto-1.
- Custo: reescrever o JSON inteiro a cada solicitação é O(n) no tamanho do dia.
  Irrelevante em centenas de registros; seria absurdo em milhões. É uma escolha
  consciente de simplicidade, não um descuido.
- Custo: **não há lock.** Dois processos escrevendo corrompem o arquivo — mais um
  motivo para ADR-006.
- Custo: `fila-atual.json` guarda **só o dia corrente** — vira do zero quando o dia
  muda. O histórico real vive nos CSVs, e ninguém nunca os apaga. Ver Aberto-3.

**Status.** Aceita.

## ADR-008 — Numeração de fila geral, reiniciada todo dia

**Contexto.** Decisão do grupo em 14/05/2026. O número serve para o cliente saber
quantas pessoas estão na frente dele.

**Decisão.** Um contador único por dia, independente da categoria.

**Consequências.**
- Ganho: número simples de entender, e a comparação "sou o 7" faz sentido para o
  cliente.
- Custo — **e este é sério:** o bot diz *"você é o número 7 na fila de atendimento de
  hoje"* ([src/mensagens.ts:50](src/mensagens.ts#L50)), mas o painel entrega a fila
  **agrupada por categoria** ([src/painel.ts:22-26](src/painel.ts#L22-L26)), e o
  propósito declarado do projeto é a atendente trabalhar por pasta. Se ela trabalhar
  por pasta, o número 7 pode ser atendido antes do número 3. **O número promete uma
  ordem que o processo de trabalho não cumpre.** Ver Aberto-9.

**Status.** Aceita, mas a consequência acima nunca foi discutida com o cartório.

## ADR-009 — Fora do horário, o bot não enfileira

**Contexto.** Decisão do grupo em 14/05/2026: atendimento seg–sex, 9h00–16h30.

**Decisão.** [src/core/motor.ts:26](src/core/motor.ts#L26) — fora do horário, encerra
a sessão, informa o horário e não gera número.

**Consequências.**
- Ganho: ninguém recebe um número que não será atendido hoje.
- Custo: **a tentativa não fica registrada em lugar nenhum.** O cartório nunca vai
  saber quantas pessoas procuraram fora do horário — que é exatamente o dado que
  diria se vale a pena esticar o expediente. Ver Aberto-10.
- Nota: o horário é conferido no fuso do cartório
  ([src/core/horario.ts](src/core/horario.ts), `America/Sao_Paulo`) via
  `Intl.DateTimeFormat`, independente do fuso do servidor. Isso está certo — e é
  exatamente o tipo de código que quebra em silêncio se alguém mexer sem teste.

**Status.** Substituída pelo ADR-012 (21/09/2026).

## ADR-010 — Sessão expira em 10 minutos

**Decisão.** `config.sessao.timeoutMinutos = 10`. Passado o tempo, os dados parciais
são descartados e o cliente é avisado ([src/mensagens.ts:38](src/mensagens.ts#L38)).

**Consequências.**
- Ganho: dado pessoal parcial não fica em memória indefinidamente.
- Custo: quem foi buscar o comprovante de PIX na gaveta e demorou 11 minutos
  recomeça o fluxo inteiro. Não sabemos se 10 minutos é pouco — não há medição.

**Status.** Aceita, valor não validado na prática.

## ADR-011 — Plataforma: Cloud API oficial da Meta, em número novo

**Contexto.** Três caminhos estavam na mesa (comparados no [README](README.md)): API
oficial em número novo, provedor não-oficial no número atual, API oficial no número
atual. As atendentes atendem hoje pelo celular e pelo WhatsApp Web, e um número
migrado para a Cloud API **perde** o app e o WhatsApp Web.

**Decisão (28/08/2026).** Cloud API oficial da Meta, em **número novo, exclusivo do
bot**. O número atual do cartório continua exatamente como está.

**Consequências.**
- Ganho: a rotina das atendentes não muda no dia da virada — risco de implantação
  baixo.
- Ganho: é canal oficial; não há risco de bloqueio por uso de biblioteca não
  autorizada.
- Custo: a verificação do CNPJ na Meta leva de 2 a 3 semanas, e a conta ainda não
  existe. Esse é o caminho crítico do cronograma. **Mas não bloqueia o
  desenvolvimento:** o número de teste gratuito da Meta (limitado a 5 destinatários)
  permite exercitar o [metaCloud.ts](src/adapters/metaCloud.ts) de ponta a ponta em
  dias.
- Custo: **o número do bot não terá caixa de entrada.** Nenhuma atendente consegue
  abrir e responder. Mas o bot promete o contrário em três lugares
  ([mensagens.ts:47](src/mensagens.ts#L47) — *"vai continuar seu atendimento por
  aqui"*, [mensagens.ts:50](src/mensagens.ts#L50), e a opção `0` do menu em
  [fluxos.ts:132](src/core/fluxos.ts#L132)). Ver Aberto-2 — é o maior buraco aberto
  do projeto.
- Custo: o cartório precisa divulgar um número novo aos clientes.

**Status.** Aceita.

## ADR-012 — Fora do horário, o bot enfileira para o próximo dia útil

**Contexto (21/09/2026).** O ADR-009 media que nenhuma tentativa fora do horário
ficava registrada (Aberto-10). Decisão do cartório: continuar coletando e
enfileirando fora do horário oficial, só avisando que a resposta vem no próximo
dia útil — em vez de recusar a mensagem de cara.

**Decisão.** [src/core/motor.ts](src/core/motor.ts) não bloqueia mais a entrada no
fluxo. `config.atendimento` (horário oficial, seg-sex 9h-16h30) passa a decidir só
duas coisas: a mensagem extra de aviso (`mensagens.foraDoHorarioAvisoFila`) e em
qual dia a solicitação é enfileirada — hoje mesmo se dentro do horário, o próximo
dia útil ([core/horario.ts:proximoDiaUtil](src/core/horario.ts)) se fora.
`queue/gerenciadorFila.ts:adicionarNaFila` recebe o dia da fila separado do
instante real da mensagem, que continua aparecendo no CSV para a atendente.

**Consequências.**
- Ganho: nenhuma tentativa se perde — resolve o Aberto-10, a demanda fora do
  horário agora fica registrada, com protocolo e número de fila.
- Ganho: a atendente só olha um arquivo por dia útil; sábado e domingo caem
  automaticamente na fila de segunda, na ordem de chegada.
- Custo — **e este era um bug de verdade, não só uma consequência prevista:**
  `obterEstado` em `queue/gerenciadorFila.ts` só recarregava o estado do disco na
  primeira chamada do processo; depois disso, pedir um dia diferente do que estava
  em memória criava um estado vazio em vez de ler o que já existia gravado. Num
  processo de longa duração (o bot real fica rodando), isso apagaria silenciosamente
  as solicitações do fim de semana assim que chegasse a primeira mensagem real de
  segunda. Corrigido junto com esta decisão — recarrega do disco toda vez que o dia
  pedido muda, não só na primeira vez.
- Custo: o cliente que escreve sexta às 23h só sabe que será atendido segunda
  quando a conversa termina (mensagem de confirmação), não já na saudação.

**Status.** Aceita.

---

# Pontos em aberto

Cada item diz **o que trava** e **quem decide**. Um item sem dono não sai do lugar.

## Aberto-1 — Onde o bot vai rodar
**Decide:** você + cartório. **Trava:** Aberto-3, Aberto-4 e a validade de ADR-006 e
ADR-007.

Três caminhos, e cada um cobra um preço diferente:

| Caminho | Disco | LGPD | Custo real |
|---|---|---|---|
| Máquina do cartório + túnel HTTPS | persistente, de graça | ótimo: o dado nunca sai da casa | se a máquina desligar, o bot some |
| Nuvem (Railway, Render, Fly) | **efêmero** — cada deploy apagaria `dados/` | dado pessoal em servidor de terceiro | exige repensar ADR-007 |
| VPS do cartório | persistente | bom | administrar Linux, HTTPS, backup, monitorar queda |

A pergunta que decide: **o cartório aceita que nome, CPF e telefone de clientes
fiquem em servidor de terceiro?** Se a resposta for não, a nuvem sai da lista e o
resto se resolve sozinho.

## Aberto-2 — Como a atendente responde no número do bot
**Decide:** você + cartório. **Trava:** ir para produção de verdade.

Consequência direta de ADR-011. Hoje o bot promete atendimento humano "por aqui" e
não existe "aqui". Opções levantadas, nenhuma escolhida:

1. Painel web mínimo com campo de resposta (o `metaCloud.ts` já sabe enviar).
2. A atendente responde pelo número antigo — exige reescrever as três mensagens.
3. Verificar se a coexistência mais recente da Meta (app + Cloud API no mesmo número)
   cobre este caso. **Não confirmei se existe nem em que estado está** — precisa
   checar a documentação antes de contar com isso.

## Aberto-3 — Retenção dos dados coletados
**Decide:** o cartório (é decisão jurídica, não técnica).

Os CSVs em `dados/` acumulam nome, CPF e telefone **para sempre**, e os comprovantes
de PIX ficam em `dados/midias/` quando `config.meta.baixarMidias` está ligado. Nunca
foi definido por quanto tempo guardar, quem apaga, nem se alguém apaga.

## Aberto-4 — Backup
**Decide:** você + cartório. **Depende de** Aberto-1.

Se a pasta `dados/` sumir, some a fila do dia e todo o histórico. Não há backup de
nenhum tipo hoje.

## Aberto-5 — Conta na Meta
**Decide:** o cartório. **Trava:** produção (2 a 3 semanas de verificação de CNPJ).

Não existe Business Manager ainda. Quem abre, com qual CNPJ, e quem fica com o acesso
de administrador?

## Aberto-6 — Prazo de certidão acima de 15 anos
**Decide:** Larissa. Hoje: `[5, 10, 15]` em `config.certidao.prazosAnos`, com
`permitirOutroPrazo: false`.

## Aberto-7 — Feriados do cartório
**Decide:** o cartório. `config.atendimento.feriados` está **vazio** — hoje o bot
atende normalmente em qualquer feriado que caia em dia útil.

## Aberto-8 — Nome oficial do cartório
**Decide:** o cartório. Hoje a saudação diz literalmente "Cartório de Protestos".

## Aberto-9 — A ordem que o número da fila promete
**Decide:** o cartório. Ver consequência de ADR-008.

A atendente vai atender **na ordem geral** (e aí a pasta é só organização visual) ou
**por pasta** (e aí o número que o cliente recebe não corresponde à ordem real)? Se
for por pasta, a mensagem precisa mudar de "você é o número 7 na fila" para algo que
não prometa posição.

## Aberto-10 — Registrar quem escreve fora do horário
**Resolvido pelo ADR-012 (21/09/2026).** A tentativa agora entra na fila do
próximo dia útil, com protocolo — não é mais preciso gravar à parte.

## Aberto-11 — Unificar o texto do cliente num lugar só
**Decide:** você. Dívida técnica de ADR-005: as confirmações moram em `fluxos.ts`,
não em `mensagens.ts`.

## Aberto-12 — Testes automatizados
**Decide:** você. Hoje: nenhum. `testes/` tem só um roteiro manual.

Prioridade pelo risco: `validadores.ts` (dígito verificador) e `horario.ts` (fuso,
borda de horário, feriado) são os que quebram em silêncio.

## Aberto-13 — O que os logs registram
**Decide:** você. Ainda não auditado: se o bot loga o conteúdo das mensagens, ele
está gravando CPF e nome em texto puro num log, o que cruza com Aberto-3.

## Aberto-14 — Visibilidade do repositório
**Decide:** você + cartório. O repo está no GitHub. Se for público, a operação interna
do cartório (fluxos, horários, mensagens) é pública também. Não há dado de cliente
versionado — o `.gitignore` cobre `.env` e `dados/` corretamente —, mas vale uma
decisão consciente em vez de um padrão herdado.
