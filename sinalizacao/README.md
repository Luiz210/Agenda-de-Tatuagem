# Servidor de sinalização

Serve só para **apresentar** os computadores na conexão pela internet: o computador do estúdio fica
registrado aqui com o ID dele, e quem quer conectar pede para falar com esse ID. Os dois trocam os dados
técnicos da conexão (WebRTC) e, a partir daí, conversam direto um com o outro. Os dados da agenda **não
passam por este servidor**, e ele não conhece o código de conexão nem as senhas.

Roda na Cloudflare (Workers + Durable Objects), no plano gratuito. Não precisa de máquina própria.

## Publicar (uma vez só)

Requisitos: Node.js 22 e uma conta gratuita em https://dash.cloudflare.com.

```
cd sinalizacao
npm install
npx wrangler login
npx wrangler deploy
```

O último comando mostra o endereço publicado, parecido com
`https://agenda-tatuagem-sinal.SEU-USUARIO.workers.dev`.

Coloque esse endereço, trocando `https` por `wss`, no campo `"sinalizacao"` do `desktop/package.json`:

```json
"sinalizacao": "wss://agenda-tatuagem-sinal.SEU-USUARIO.workers.dev",
```

Enquanto esse campo estiver vazio, a opção "pela internet" aparece desativada no aplicativo e o resto
funciona como sempre. Para testar sem gerar o instalador, dá para usar a variável de ambiente
`AGENDA_SINALIZACAO` no lugar do campo.

## Retransmissão (TURN), para redes que não deixam conectar direto

Sem este passo, a conexão funciona quando os dois roteadores permitem conexão direta (a maioria das
internets fixas). Com CGNAT dos dois lados, 4G/5G ou firewall mais fechado, é preciso um servidor que
retransmita os dados. O aplicativo já sabe usar o da Cloudflare; falta só criar a chave:

1. No painel da Cloudflare, abra **Realtime → TURN Server** e crie uma chave ("Create TURN App").
2. Anote o **Turn Token ID** e o **API Token**.
3. Guarde os dois no servidor de sinalização (eles não vão para o repositório nem para o aplicativo):

```
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```

O servidor usa essa chave para pedir à Cloudflare credenciais que valem 24 horas e as entrega aos
computadores na hora de conectar. Os dados retransmitidos continuam cifrados de ponta a ponta: a
Cloudflare só repassa.

Na tela Conexão do computador do estúdio, cada computador conectado aparece como "direto" ou "por
retransmissão".

## Testar no próprio computador

```
npm run dev      (numa janela: sobe o servidor em ws://127.0.0.1:8787)
npm run teste    (em outra: confere registro, recusa de ID desconhecido, repasse dos sinais)
```

Para abrir o aplicativo apontando para o servidor local (PowerShell, na pasta `desktop`):

```
$env:AGENDA_SINALIZACAO = "ws://127.0.0.1:8787"; npm start
```

## O que ele guarda

Por estúdio: o resumo (SHA-256) da chave do computador do estúdio, para outro computador não conseguir
se registrar com o mesmo ID. Nada mais.

## Trocar de hospedagem

O protocolo é só WebSocket com mensagens JSON (veja o começo de `src/index.js`). Se um dia for preciso
sair da Cloudflare, basta reescrever este servidor em qualquer lugar que aceite WebSocket e trocar o
endereço no `desktop/package.json`. O aplicativo não muda.
