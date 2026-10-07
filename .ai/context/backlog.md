# Backlog

Registrado em: 2026-10-03
Origem: pedidos do usuário. Nada aqui está em implementação; cada item vira
uma spec quando o usuário decidir.

## Previdência

Fora de todas as fatias até agora. O usuário indicou que é o próximo assunto
depois dos ajustes em andamento.

## Gastos familiares e outras áreas da vida

Origem: conversa com o usuário em 2026-10-07. Estado: direção confirmada para
evolução futura; implementação não autorizada. O usuário pediu registrar o
combinado no backlog e informou que solicitará o início em outro momento.
Não iniciar implementação sem um novo pedido explícito dele.

Em novo pedido de 2026-10-07, o usuário forneceu o briefing da aba
`Gastos_Familia` e os dados e solicitou **somente preparar um prompt**.
Depois, declarou o primeiro arquivo de gastos errado e enviou a fonte
correta, que substitui integralmente a anterior. O
[prompt de continuidade](gastos-familia-prompt.md) concentra os
requisitos detalhados, a futura navegação lateral/hambúrguer, o acesso às
áreas pessoais exclusivo da conta indicada e os pontos de revisão dos dados.
Isso não autoriza implementação nem carga no banco.

O usuário já controla gastos familiares em outro Excel e considera levá-los
ao app. Também imagina reunir outras áreas da vida, como remédios no futuro,
e quer entender como evitar uma interface sobrecarregada e se aplicações
separadas podem ser reunidas.

O usuário esclareceu que quer disponibilizar a área de investimentos para
amigos, mantendo Saúde e as outras áreas pessoais restritas.

Direção confirmada:

- manter um único app modular, com áreas e navegação próprias; organizar
  Investimentos (o Portifolio atual) e Gastos familiares em Finanças, deixando
  Saúde, como controle de remédios, para uma evolução futura;
- manter a stack atual: Next.js, Better Auth, Prisma e PostgreSQL (Neon em
  produção);
- combinar papéis (roles), que definem ações como administrar acessos, com
  módulos habilitados por usuário, que definem as áreas disponíveis;
- amigos recebem acesso somente a Investimentos e entram diretamente nessa
  área; o usuário pode alternar entre os módulos liberados para ele;
- mostrar apenas a navegação autorizada e verificar permissões no servidor
  nas páginas, consultas e gravações, inclusive em acessos por URL direta;
- preservar os dados por usuário e exigir compartilhamento explícito para
  dados de terceiros; o papel de administrador não deve conceder leitura
  automática das carteiras ou de outros dados pessoais.

Fato observado: o código atual já possui módulos, login e escopo dos dados
por usuário, mas ainda não roles nem concessões de acesso por módulo.

Atualizado em 2026-10-07: o usuário pediu o início ("manda ver"). As áreas, a
concessão e Gastos familiares foram implementados localmente nas specs
[081](../specs/081-module-access-and-area-navigation.md) a
[084](../specs/084-family-expenses-backup-and-load.md), com as respostas dele
sobre DEVE/DEVO, valores negativos, parcelas e carga local registradas nelas.
Continuam em aberto: Saúde (remédios), compartilhamento familiar, gestão de
acessos pela interface e a carga na produção depois do deploy.

Antes de virar spec, entender o funcionamento da planilha de gastos e definir
quem precisará consultar ou registrar esses dados. Compartilhamento familiar,
permissões detalhadas e a forma de gerenciar roles ainda precisam ser
definidos; o plugin Admin do Better Auth foi citado como possibilidade, sem
decisão de adotá-lo. Não houve autorização para renomear o produto, alterar a
navegação agora ou substituir o próximo assunto indicado acima.

## Transações dentro das posições

Implementado nas specs 056 a 059 e publicado em 2026-10-04; a revisão posterior
das specs 063 a 066 permanece local, sem commit ou deploy. As regras estão no
[prompt consolidado](position-transactions-prompt.md). O texto abaixo fica como
histórico do pedido.

Em 2026-10-04, o usuário pediu investigação do código e perguntas para
detalhar esta ideia junto de outros ajustes, preservando a praticidade atual.
O [prompt consolidado](position-transactions-prompt.md) é a fonte principal
das respostas finais de 2026-10-04; a investigação e pesquisa de Tesouro/CDI
ficam em [Descoberta dos próximos ajustes](next-adjustments-discovery.md).
Depois do planejamento, o usuário autorizou neste chat continuar a
implementação que outra IA havia iniciado e documentar cada fatia. O estado
atual fica no [índice das specs](../specs/README.md), distinguindo produção e revisão local.
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
