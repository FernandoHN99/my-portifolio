# Backlog

Registrado em: 2026-10-03
Origem: pedidos do usuário. Nada aqui está em implementação; cada item vira
uma spec quando o usuário decidir.

## Previdência

Fora de todas as fatias até agora. O usuário indicou que é o próximo assunto
depois dos ajustes em andamento.

## Transações dentro das posições

Implementado localmente em 2026-10-04, nas specs 056 a 059 (em commit na
branch local `feat/specs-053-062`, sem deploy); as regras finais estão no
[prompt consolidado](position-transactions-prompt.md). O texto abaixo fica como
histórico do pedido.

Em 2026-10-04, o usuário pediu investigação do código e perguntas para
detalhar esta ideia junto de outros ajustes, preservando a praticidade atual.
O [prompt consolidado](position-transactions-prompt.md) é a fonte principal
das respostas finais de 2026-10-04; a investigação e pesquisa de Tesouro/CDI
ficam em [Descoberta dos próximos ajustes](next-adjustments-discovery.md).
Depois do planejamento, o usuário autorizou neste chat continuar a
implementação que outra IA havia iniciado e documentar cada fatia. O estado
atual fica nas specs [056 a 062](../specs/README.md); tudo é local, sem deploy.
Verifique o código atual e a spec antes de continuar.

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

As decisões sobre legado, base de cada mês, edição sem cascata e fonte do CDI
estão no briefing consolidado e nas specs de implementação; as descrições
acima preservam a origem do pedido de 2026-10-03.
