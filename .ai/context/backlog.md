# Backlog

Registrado em: 2026-10-03
Origem: pedidos do usuário. Nada aqui está em implementação; cada item vira
uma spec quando o usuário decidir.

## Previdência

Fora de todas as fatias até agora. O usuário indicou que é o próximo assunto
depois dos ajustes em andamento.

## Transações dentro das posições

Pedido do usuário em 2026-10-03, que substitui o "livro de movimentações"
anotado antes. Ele sente falta de registrar compras e vendas para mapear valor
de compra e venda, marcar nos gráficos os momentos de compra e entender melhor
a valorização e a performance do ativo, de um jeito fácil.

O que ele descreveu:

- **duas portas de entrada**: criar uma posição nova, ou criar uma transação
  numa posição que já existe. A inclusão de posição atual seria reformulada a
  partir disso;
- **transação versátil**: ao adicionar, o app já busca a cotação atual do
  ativo; se não houver, o usuário informa. Ele pode informar a quantidade ou o
  valor total, e o outro é calculado pelo preço (o resultado inverso);
- **rastreio desde o início**: guardar o dia de criação da posição;
- **renda fixa por % do CDI**: informar o percentual do CDI, e o rendimento
  ser calculado automaticamente com base no CDI vigente na criação do ativo;
- **conta corrente e saldos sem cálculo direto**: manter transações também,
  mas permitindo anotar o saldo atual; o app compara com o anterior, decide se
  foi entrada ou saída e gera a transação;
- **meses abertos e fechados**: a regra de mês aberto continua
  ([spec 034](../specs/034-open-closed-months.md)); transações de meses
  fechados não podem ser editadas, só as de meses abertos;
- **página da posição**: mostrar o histórico de compras e vendas, completo e
  funcional, e os momentos de compra nos gráficos
  ([spec 016](../specs/016-position-history.md) hoje estima aportes pela
  variação de quantidade).

Questões a resolver quando virar spec: como as transações convivem com as
posições mensais já importadas; se a posição mensal passa a ser derivada das
transações; e de onde vem o histórico do CDI (por exemplo, a série do Banco
Central).
