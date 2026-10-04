# 064 — Meta Selic informativa e atualização local das cotações

Estado: implementada e validada localmente em 2026-10-04. Sem publicação.
A apresentação mudou na [spec 067](067-selic-per-month.md): o card próprio saiu,
e a Selic de cada competência fica no card do dólar e no cabeçalho das Cotações.
A trava do botão de desenvolvimento passou a `devToolsEnabled()`
([spec 072](072-dev-branch-and-local-tools.md)).
Definida em: 2026-10-04, ajustes 3, 7 e 8 pedidos pelo usuário.

## Comportamento aprovado

- Exibir a meta Selic na Visão geral e nas Cotações, com unidade `% a.a.`,
  identificação de meta do Copom, fonte Banco Central e data da observação.
- Consultar no máximo uma vez por 24 horas; abrir o aplicativo apenas lê a taxa
  conhecida. A Selic é informativa e não altera posições ou gera rendimento.
- Mostrar uma atualização manual somente no ambiente de desenvolvimento,
  para executar localmente o mesmo job usado pelo agendamento. A produção
  continua dependendo do job.
- Manter a consulta de preço atual na inclusão de um ticker; o carregamento
  das cotações passadas continua no job, conforme a spec 063.

## Fonte e unidade

A [série SGS 432 do Banco Central](https://dadosabertos.bcb.gov.br/pt_PT/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom)
representa a **meta Selic definida pelo Copom**, divulgada em percentual ao ano.
É distinta da Selic efetiva diária e do CDI. Não entra nas tabelas de preços
em reais nem usa a coluna `daily_percent` do CDI.

`bcb-selic.ts` consulta gratuitamente a API JSON oficial com janela de 30 dias
terminando no dia de Brasília. Se falhar, usa o webservice SOAP oficial do SGS,
com a mesma série. Dados inválidos, futuros ou bloqueados não viram taxa.

## Persistência e execução

- `ReferenceRate`, tabela compartilhada `reference_rates`: chave
  `SELIC_TARGET`, percentual anual, data da observação, fonte, último sucesso,
  última tentativa e erro. Campos de valor permitem nulo antes do primeiro sucesso.
- Migração: `20261004220000_selic_reference_rate`, aditiva, sem modificar dados
  da carteira. A tabela fica fora do backup por conter dados públicos
  recarregáveis; o [formato v5](../../docs/backup-format.md) não muda.
- `syncSelicReference` reserva uma tentativa sob bloqueio consultivo de
  transação. O bloqueio termina antes da consulta de rede; a última tentativa
  impede duplicação por 24 horas, inclusive após falha.
- Falha preserva percentual e data anteriores; a leitura marca uma taxa antiga
  como última disponível. Sem sucesso prévio, a interface mostra ausência de
  cotação, sem número inventado.
- `syncQuotes` executa a Selic mesmo sem símbolo devido. Não chama mais o
  cálculo bruto de aplicações pelo CDI (pausa na spec 065).
- `getSelicReferenceRate` faz somente leitura. O componente
  `SelicReferenceCard` recebe esse valor nas duas telas.

## Atualização somente em desenvolvimento

`DevQuoteSyncButton` chama `POST /api/quotes/dev-sync`, com sessão e checagem de
origem. O endpoint confirma `NODE_ENV === development` **antes** de consultar
sessão, banco ou provedores; em produção, responde 404 a uma chamada direta.
O componente também retorna nulo fora de desenvolvimento.

O botão informa o resultado do job e atualiza a tela. Respeita as cadências,
os históricos pendentes e o bloqueio contra execuções simultâneas; se tudo
estiver em dia, informa isso. Com edição pendente, pede que seja salva primeiro
para não descartar os campos. Não altera o agendamento nem cria cron local.

A operação pelo terminal, função do Neon e botão está documentada em
[Job de cotações](../../docs/quote-sync-job.md).

## Critérios de aceite

- Meta Selic visível em ambas as telas e nunca apresentada em BRL ou CDI.
- Navegação não consulta o Banco Central.
- Repetir o job antes de 24 horas não repete a consulta de taxa.
- Falha de fonte preserva a última taxa conhecida.
- Sem taxa, a tela apresenta ausência, sem valor padrão.
- Atualização manual visível em desenvolvimento e ausente em produção.
- Endpoint de desenvolvimento autenticado, com restrição de origem e bloqueio
  em produção antes de qualquer consulta.
- O job não recalcula aplicações de renda fixa.

## Verificação registrada

Em 2026-10-04:

- `pnpm exec tsx --test tests/unit/selic-reference.test.ts`: 6 cenários passaram
  (validação de datas/unidade, SOAP só da série correta, reserva após falha
  JSON, cadência e concorrência, preservação após falha, endpoint de produção).
- ESLint dos arquivos alterados nesta spec passou.
- Typecheck completo passou após a integração dos componentes.
- Consulta real somente de leitura à API JSON oficial e à reserva SOAP: ambas retornaram
  `observedOn: 2026-10-04`, `percentAnnual: 13.75`, com as respectivas fontes.
  A API respondeu neste ambiente nesta verificação; a indisponibilidade anterior
  registrada na spec 060 não foi assumida como estado atual.
- Postgres no schema isolado `tx_adjustments_063`: duas consultas simultâneas
  fizeram uma única chamada de fonte; repetir em 23 horas não consultou;
  falha após 24 horas preservou 13,75% e as datas do último sucesso. Somente
  `ReferenceRate` de teste foi gravada, sem alteração de carteiras.
- A leitura do servidor `getSelicReferenceRate`, com `fetch` bloqueado e
  contado, retornou a taxa do schema de teste sem nenhuma consulta HTTP.
- Os 16 testes unitários de Selic e Tesouro passaram juntos, incluindo a
  regressão da data oficial da cotação no job.
- `tests/e2e/selic-reference.spec.ts`: 4 cenários passaram (Desktop Chrome e
  WebKit/iPhone 16 Plus), conferindo fonte, unidade, data e valor nas duas
  telas, ausência de pedidos do navegador ao Banco Central e atualização
  manual somente após clicar. O endpoint do job foi sempre simulado.
- A integração também passou nos 9 cenários da revisão mobile em WebKit
  (retrato, paisagem, ausência de overflow, gestos e campos legíveis) e nos
  8 cenários de pickers em Desktop/WebKit. Estes últimos foram adaptados à
  inclusão guiada da spec 066: Posição → Ativo, sem saltar etapas.
- Os testes usaram `E2E_BASE_URL=http://127.0.0.1:3120`, servidor sobre o
  schema isolado `tx_adjustments_063`, sem salvar posições ou disparar job real.

Não foi executado job contra os dados reais, nem deploy ou commit.

A migração aditiva foi aplicada também ao Postgres local em `127.0.0.1`,
schema `public`, depois de conferir que era a única pendência. Para deixar
a taxa disponível na carteira local, foi executada somente
`syncSelicReference`: resultado `fetched`, observação de 2026-10-04, sem
sincronizar preços ou recalcular posições. O build local conjunto passou;
a produção não foi acessada ou migrada.

## Referências

- [Fonte oficial: gráfico Meta Selic, SGS432](https://bcb.gov.br/estatisticas/detalhamentoGrafico/graficoshome/selic)
- [Job agendado](053-scheduled-quote-sync.md)
- [Renda fixa manual nesta etapa](065-manual-fixed-income.md)
