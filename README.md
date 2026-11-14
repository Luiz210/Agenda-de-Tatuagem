# Agenda de Tatuagem

Aplicativo de computador para tatuadores organizarem a agenda, os clientes e os pagamentos, sem depender
de WhatsApp e caderno.

## Funcionalidades

- **Hoje:** quem é atendido no dia, o horário, o local do corpo e quanto vai receber. Sem atendimento no
  dia, mostra o próximo.
- **Agenda:** o mês inteiro, com o horário e o cliente em cada dia. Clicando no dia, aparecem as sessões
  e dá para agendar outra.
- **Cliente novo na hora:** o cadastro é feito no próprio agendamento, sem sair da tela.
- **Tatuagens com várias sessões:** descrição, local do corpo, valor total, imagens de referência e quantas
  sessões forem necessárias.
- **Pagamentos parciais:** sinal e demais pagamentos, com o quanto já foi pago e o quanto falta.
- **Ficha do cliente:** todas as tatuagens que ele fez e quanto já pagou.
- **Confirmação pelo WhatsApp:** um clique abre a conversa com a mensagem de confirmação pronta.
- **Login e uso em rede:** um computador pode servir os dados para outros da mesma rede.
- **Uso pela internet:** computadores autorizados conectam ao computador do estúdio de qualquer lugar,
  sem abrir portas no roteador.
- **Atualização automática:** versões novas são baixadas e instaladas pelo próprio aplicativo.

## Tecnologias

| Parte | Tecnologia |
| --- | --- |
| Back-end | Java 17, Spring Boot 4, JPA/Hibernate, banco H2 em arquivo |
| Telas | Angular 22 |
| Aplicativo de PC | Electron, com o Java embutido no instalador |
| Conexão pela internet | WebRTC (canal de dados cifrado), sinalização em Cloudflare Workers |

Os dados ficam em `%USERPROFILE%\.agenda-tatuagem`. O servidor usa a porta **8090**.

## Estrutura

```
backend/    API em Spring Boot
frontend/   Telas em Angular
desktop/    Aplicativo Electron que junta as telas e o back-end
sinalizacao/  Servidor que apresenta os computadores na conexão pela internet
gerar_instalador.bat   Gera o instalador do Windows
publicar.bat           Gera e publica uma versão nova no GitHub
```

## Rodar em desenvolvimento

Requisitos: JDK 17 ou mais novo e Node.js 22.

1. **Back-end:** abra a pasta `backend` no Eclipse e rode `AgendaTatuagemApplication`, ou use
   `mvnw.cmd spring-boot:run`.
2. **Telas:** na pasta `frontend`, rode `npm install` uma vez e depois `npm start`. Acesse
   http://localhost:4200.

## Gerar o instalador

Rode `gerar_instalador.bat` como administrador. O instalador fica em `desktop\dist`. Quem instala não
precisa baixar Java nem banco de dados.

## Publicar uma versão

1. Configure a variável de ambiente `GH_TOKEN` com uma chave do GitHub que tenha permissão
   **Contents: Read and write** neste repositório.
2. Rode `publicar.bat` como administrador.

Os aplicativos instalados encontram a versão nova sozinhos e avisam quando ela está pronta para instalar.
Para isso, este repositório precisa ser **público**.

## Conexão pela internet

Na tela **Conexão** (ícone da bandeja), o computador do estúdio marca "Deixar computadores autorizados
conectarem pela internet". A tela passa a mostrar o **ID do estúdio** e o botão **Gerar código de
conexão**. No outro computador, escolha "Conectar a outro computador" → "Pela internet" e digite o ID e
o código. O código vale 10 minutos e serve uma vez; depois disso o computador fica autorizado e
reconecta sozinho, até ser removido na lista "Computadores autorizados".

Como funciona:

- Os dois aplicativos abrem um canal WebRTC cifrado (DTLS) e as mesmas chamadas que iriam pela rede
  local passam por ele. As telas e o back-end não mudam.
- A conexão é direta sempre que os roteadores permitem (STUN). Quando não permitem (CGNAT, 4G/5G,
  firewall), passa por um servidor de retransmissão (TURN), ainda cifrada de ponta a ponta.
- Nenhuma porta é aberta: o servidor da agenda continua em `127.0.0.1` e os dois lados só fazem
  conexões de saída.
- O código de conexão e a chave de cada computador nunca são enviados: cada lado prova que os conhece
  com um HMAC preso às impressões digitais daquela conexão, o que também barra um intermediário.
- Por cima disso continua o login normal da agenda.

Para ativar, publique o servidor de sinalização uma vez: veja [sinalizacao/README.md](sinalizacao/README.md).
Testes da lógica de pareamento: `npm run teste` na pasta `desktop`.

## Próximos passos

Veja [TAREFAS.md](TAREFAS.md).

## Dados de demonstração

Para testar as telas com dados de exemplo (colaboradores, clientes, tatuagens, sessões, sinais, imagens, contatos, estoque, produtos, vendas e histórico):

```
cd backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=demo"
```

Os dados são acrescentados ao banco atual uma única vez, por partes (agenda e estoque), e nada é apagado. Os colaboradores de exemplo usam a senha `senha1234` e os códigos 4821 (Rafa), 5932 (Bia), 6043 (Duda) e 7154 (Carol, administradora). O app instalado nunca carrega esses dados.
