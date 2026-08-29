# Ligando o bot no WhatsApp oficial (Cloud API da Meta)

O código já está pronto: [src/adapters/metaCloud.ts](src/adapters/metaCloud.ts).
O que falta é a papelada no painel da Meta. Ordem sugerida abaixo.

Este passo a passo vale para os caminhos **A** (número novo) e **C** (número atual)
da comparação do [README](README.md#1-plataforma-de-whatsapp--é-o-único-bloqueio-real).
Se o cartório escolher o **B** (Z-API / Evolution no número atual), nada aqui se
aplica — é outro adaptador, com a mesma interface `AdaptadorWhatsApp`.

## 1. Antes de tudo: o número

- Precisa ser um número que **não esteja em uso** no app do WhatsApp nem no WhatsApp
  Business. Se estiver, tem que ser apagado de lá primeiro (o número migra, não
  duplica). Na prática: use uma linha nova do cartório, não a que já atende.
- Ele precisa receber SMS ou ligação uma vez, para confirmar.
- **Depois de migrado, esse número não tem mais caixa de entrada.** Nada de ver
  conversas no celular: tudo passa pelo webhook. É por isso que o
  `npm run painel` e a pasta `dados/` existem — é ali que a atendente vê a fila.

## 2. Criar o app no painel

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Criar app**
2. Caso de uso: **Conectar-se a clientes pelo WhatsApp**
3. Vincular a um **portfólio empresarial** (Business Manager) do cartório
4. No app, abrir **WhatsApp → Configuração da API**

Anote dali:

| No painel | No `.env` |
| --- | --- |
| ID do número de telefone | `WHATSAPP_PHONE_NUMBER_ID` |
| Token de acesso | `WHATSAPP_TOKEN` |
| Configurações do app → Básico → Chave secreta | `WHATSAPP_APP_SECRET` |

## 3. Token permanente

O token que aparece na tela inicial expira em 24h — serve para testar, não para
produção. O definitivo:

**Configurações do negócio → Usuários → Usuários do sistema** → criar usuário →
atribuir o app do WhatsApp → **Gerar token** com as permissões:

- `whatsapp_business_messaging`
- `whatsapp_business_management`

Esse token não expira. Ele dá acesso a enviar mensagem em nome do cartório —
tratar como senha de banco: só no `.env`, nunca no git (o `.gitignore` já cobre).

## 4. Subir o webhook

A Meta só aceita URL **HTTPS, porta 443, com certificado válido**. Ela não
alcança `localhost`.

**Em desenvolvimento**, um túnel resolve:

```bash
npx ngrok http 3000        # ou: cloudflared tunnel --url http://localhost:3000
```

**Em produção**, hospedar em algum lugar com domínio e HTTPS (Railway, Render,
Fly.io, ou um VPS com nginx). O endpoint `/saude` existe para o health check
dessas plataformas.

Com o servidor rodando:

```bash
cp .env.exemplo .env       # e preencher
npm run whatsapp
```

Então no painel, **WhatsApp → Configuração → Webhook → Editar**:

- **URL de callback:** `https://SEU-DOMINIO/webhook`
- **Verificar token:** exatamente o mesmo texto do `WHATSAPP_VERIFY_TOKEN`

Ao salvar, a Meta faz um GET de confirmação. Se der erro, o log do bot diz qual
dos dois lados está diferente.

Depois de verificar, clicar em **Gerenciar** e assinar o campo **`messages`**.
Sem esse segundo passo o webhook fica verificado mas nunca recebe nada — é o
esquecimento mais comum.

## 5. Testar

Mande "oi" do seu celular para o número do cartório. Deve chegar a saudação e o
menu. Se não chegar, na ordem:

1. O bot logou algo? Sem log = o POST não chegou (campo `messages` não assinado,
   ou URL errada).
2. `assinatura inválida` = `WHATSAPP_APP_SECRET` errado.
3. `Meta respondeu 401` = token errado ou expirado (o de 24h).
4. `Meta respondeu 400` = geralmente o número destino em formato inválido.

Com número de teste da Meta, só dá para conversar com até 5 números
cadastrados na lista de destinatários permitidos.

## 6. Para valer

- **Verificação do negócio** (CNPJ do cartório) é obrigatória para sair dos
  limites de teste e para o número aparecer com o nome do cartório.
- **Janela de 24h:** responder livremente só é permitido dentro de 24h da última
  mensagem do cliente. Como o bot nunca inicia conversa, isso nos basta — não
  precisamos de template aprovado nem pagamos por mensagem de template. Se algum
  dia o cartório quiser avisar o cliente por iniciativa própria ("sua certidão
  está pronta"), aí sim entra template pago — confirmar o preço vigente em
  [Preços do WhatsApp Business](https://developers.facebook.com/docs/whatsapp/pricing).
- **Versão da API:** está em `config.meta.versaoApi` (hoje `v23.0`). A Meta
  aposenta versões antigas em ~2 anos; é um campo só para trocar.
- **LGPD:** com `baixarMidias` ligado, comprovantes de PIX ficam em
  `dados/midias/`. É dado pessoal em disco do cartório — combinar com a Larissa
  por quanto tempo guardar e quem apaga.

## O que dá para adiantar antes da decisão da Larissa

Os passos 2 e 3 (criar o app, gerar o token permanente) e a **verificação do
CNPJ** não dependem de qual número será usado — e a verificação é justamente o
que leva as duas ou três semanas. Vale começar por ela.
