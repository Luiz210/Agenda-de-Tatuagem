# Tarefas

Levantadas na reunião com o estúdio (novembro de 2026). Cada fase vira uma versão publicada.

Combinado: toda tabela nova entra nos dados de demonstração (`DadosDeDemonstracao.java`, perfil `demo`), com exemplos de todas as situações que as telas mostram.

## Fase 1: base do estúdio (publicada na 1.0.2)

- [x] Colaboradores: listar, cadastrar, editar, excluir (nome, função, telefone, aluguel, dia de pagamento, perfil).
- [x] Perfis administrador e padrão. Só o administrador cadastra colaboradores e verá o financeiro.
- [x] Computador do estúdio sem login: consulta livre, código pessoal (PIN) para alterar, válido por 5 minutos.
- [x] Em outros computadores, login normal com usuário e senha (convite e conexão como antes).
- [x] Histórico de todas as alterações: quem, quando, onde e o que mudou (tela Histórico, só administradores).
- [x] Tatuagem e sessão com responsável. Valores e pagamentos visíveis só para o responsável.
- [x] Sinal: valor e situação (pago / não pago), aviso de "sinal pendente" na agenda.
- [x] Durações longas na agenda (até 12 horas).

## Fase 2: clientes (reengajamento) (feita)

- [x] Destaque para clientes com a última tatuagem há 6 meses ou mais (quem tem horário marcado não entra).
- [x] Marcar como "Contatado": tira o destaque, que volta 6 meses depois do contato.
- [x] Histórico de contatos na ficha (quem, quando, observação), com "Desfazer".
- [x] Filtro "Para contatar" em Clientes e bloco "Clientes para chamar de volta" na tela Hoje.
- [x] WhatsApp com mensagem de reengajamento pronta.

## Fase 3: estoque e produtos (feita)

- [x] Estoque (materiais): listar com imagem, cadastrar, editar, repor, dar baixa, excluir. Nome, imagem, unidade, limiar de compra.
- [x] Produtos: idem, com preço de venda, registro de cada venda (quantidade, preço, forma) e limiar opcional.
- [x] Aba "Para comprar" com os itens no limiar (Comprar) ou perto dele (Acabando).
- [x] Histórico de movimentos por item, com "Desfazer"; faturamento por produto só para administradores.

## Avisos no menu (feito, falta testar)

- [x] Número ao lado de Agenda (sessões de hoje a 2 dias sem confirmação), Clientes (para contatar), Estoque e Produtos (no limiar de compra).
- [x] Sessão "Confirmada": botão "Confirmou" no cartão; volta a pendente se a sessão for remarcada.

## Fase 4: financeiro (feita, falta testar)

- [x] Tela Financeiro só para administradores (no PC do estúdio, pede o código de um administrador até para ver).
- [x] Caixa com saldo começando em zero: entradas (aluguéis, vendas de produtos, entradas avulsas) menos saídas (contas pagas).
- [x] Contas a pagar por mês, em ordem de vencimento, com vencidas em destaque, foto da conta e baixa com comprovante.
- [x] Compras parceladas: cada parcela vira uma conta no mês dela; o detalhe da compra mostra todas e permite adiantar.
- [x] Aluguel mensal pago de uma vez, com atraso depois do dia combinado; resumo dos atrasados.
- [x] Entradas avulsas recebidas ou a receber.
- [x] O valor das tatuagens não entra no caixa do estúdio.

## Fase 5: painel e relatórios

- [ ] Clientes não contatados; estoque e produtos abaixo do limiar; produto mais vendido e faturamento com produtos.
- [ ] Aluguel a receber e colaboradores em atraso.
- [ ] Total de contas e de compras, próximo vencimento e item mais caro.
- [ ] Lucro líquido: (aluguéis + vendas de produtos) − (contas + compras).

## Depois

- [ ] WhatsApp mais completo: mensagem editável, lembrete automático no dia anterior.
- [ ] Recuperar senha ("esqueci a senha").
- [ ] Regra do firewall do Windows no instalador, para o modo compartilhado funcionar sem configurar nada.
