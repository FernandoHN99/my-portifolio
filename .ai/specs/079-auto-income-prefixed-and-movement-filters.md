# 079 — Rendimento automático como nos bancos, prefixado e filtros das movimentações

Estado: concluída e publicada na produção em 2026-10-06, inclusive na função
`quotesync` do Neon. Registro em [Produção](../context/production.md).
Origem: pedido do usuário em 2026-10-06.

## Pedidos

1. Calcular automaticamente o valor bruto dos ativos de renda fixa e de caixa em
   reais pós-fixados (pelo CDI) e prefixados (pela taxa), com o rendimento
   entrando todo dia, como os bancos calculam.
2. Uma flag nesses ativos para escolher se o cálculo é automático.
3. Prefixado como subclasse e nas metas. Um item com meta 0 não aparece nos
   gráficos.
4. Na aba Rateio, a rentabilidade fica opcional nas subclasses compatíveis e
   obrigatória quando a flag está marcada.
5. Filtros por tipo (aporte, rendimento, retirada) nas movimentações.
6. **Depois de ver a primeira versão:**
   - o bloco de rendimento ficou grande e deslocado à esquerda: deixá-lo
     dentro da classificação, pequeno e minimalista;
   - cada classificação que atende à classe e à subclasse deve ter o seu;
   - com duas classificações, o bloco sumia.

## Respostas do usuário (2026-10-06)

- **Rendimento na lista:** uma linha de rendimento automático por mês,
  atualizada todo dia.
- **O que some dos gráficos:** só o item com meta 0 e sem saldo.
- **Abrangência:** só renda fixa e caixa em reais. O Tesouro continua pelo PU
  oficial ([specs 061](061-treasury-direct-quotes.md) e
  [070](070-treasury-own-value.md)).
- **Início do cálculo:** contar como os bancos contam, para o valor conferir
  com o do banco.

## Decisões

### Como os bancos calculam

- **Pós-fixado:**
  - usa o CDI de cada dia útil com taxa publicada (série 12 do Banco Central);
  - o fator do dia é 1 + CDI × percentual.
- **Prefixado:**
  - o fator do dia útil é (1 + taxa ao ano)^(1/252), na base 252;
  - os dias úteis excluem os feriados nacionais, como no calendário da ANBIMA
    (`domain/business-days.ts`): as datas fixas, a Consciência Negra desde
    2024 e, pela Páscoa, Carnaval, Sexta-feira Santa e Corpus Christi.
- **Convenção da B3:**
  - o dia da aplicação rende e o do resgate não;
  - o rendimento de um dia entra no saldo do dia seguinte.
- **Movimentações:**
  - cada aporte rende desde o próprio dia;
  - cada retirada sai do saldo do dia dela, e uma retirada acima desse saldo é
    recusada.
- **Valor bruto:** sem IR nem IOF. O líquido recebido entra como acerto na
  liquidação.
- **Ponto de partida:**
  - uma posição existente começa da base do mês, que é o fechamento do mês
    anterior, desde o dia 1;
  - uma posição nova começa do valor aplicado no dia da aplicação;
  - uma aplicação anterior à competência rende desde o próprio dia, entrando
    com o valor e o dia originais.
- **Até quando calcula:**
  - o CDI vai até o dia seguinte à última taxa publicada;
  - o prefixado vai até hoje;
  - os dois param no fim da competência.

### Dados

- **Ativo:** `auto_income` guarda a flag, uma por ativo.
- **Classificação:** `position_allocations.rate_percent` guarda a
  rentabilidade de cada classificação, lida pelo indexador da subclasse: % do
  CDI no Pós-fixado e taxa ao ano no Prefixado.
  - Cada classificação compatível tem a sua, como pedido no ajuste 6.
  - A taxa é do mês, como o rateio, e passa ao mês seguinte na virada.
- **Migrações:**
  - `20261006150000_auto_income_and_fixed_rate` cria a flag e uma taxa no
    ativo;
  - `20261006190000_allocation_rate` leva a taxa para as classificações e apaga
    a do ativo;
  - a segunda é uma migração nova porque a primeira já estava aplicada no
    banco local, e reescrevê-la faria o `prisma migrate dev` pedir para apagar
    o banco.
- **Legado:** `assets.cdi_percent`, da spec 060, ficou no banco e no backup,
  sem uso. A migração copia o valor dele para as classificações Pós-fixado.
- **Posição:** os campos da [spec 060](060-cdi-fixed-income.md) voltam a ser
  usados, só quando a flag do ativo está ligada.
  - `calculation_start_date`, `calculated_income_brl`,
    `income_calculated_through` e `income_calculation_error`.
  - A pausa global da [spec 065](065-manual-fixed-income.md)
    (`AUTOMATIC_FIXED_INCOME_ENABLED`) saiu.
- **Rendimento calculado:**
  - não vira transação;
  - a lista mostra uma linha somente de leitura, "Rendimento automático até
    DD/MM/AAAA", marcada "automático".
- **Backup:** os campos novos vão e voltam no formato da versão 5.
  - Um arquivo sem eles restaura com o cálculo desligado
    ([formato do backup](../../docs/backup-format.md)).
- Na carteira local não havia nenhuma posição com dados do cálculo antigo.

### Cálculo com mais de uma classificação

- A posição fica sempre dividida pelos pesos do rateio.
- O fator de cada dia é a média dos fatores das classificações, ponderada pelos
  pesos; uma classificação sem rendimento no dia entra com fator 1.
- Com uma classificação só, é o cálculo do CDI ou do prefixado.
- Com alguma parte pelo CDI, a posição rende até o dia seguinte à última taxa
  publicada.
- Uma movimentação depois desse dia entra no saldo e rende quando a taxa chegar.
  Antes, ela deixava o cálculo indisponível.

### Comportamento

- **Ligar (lápis, aba Rateio):**
  - exige a taxa em cada classificação, e todas precisam ser pós-fixadas ou
    prefixadas;
  - é recusado se o mês já tem rendimento manual. O aviso pede para apagá-lo
    nas movimentações antes;
  - começa no dia 1 do mês aberto.
- **Com o cálculo ligado:**
  - "Movimentar" oferece só aporte e retirada;
  - cada movimentação recalcula pela taxa.
- **Desligar:**
  - o calculado vira o rendimento registrado "Rendimento automático até …",
    sem mudar o saldo;
  - religar apaga esse registro e recalcula.
- **Liquidar:**
  - fecha o cálculo no dia do resgate, com o rendimento até a véspera guardado
    como "Rendimento automático até …";
  - o valor recebido diferente do saldo entra como acerto, como na
    [spec 076](076-position-liquidation.md);
  - posição liquidada não religa o cálculo no mês.
- **Virada e cópia do mês:** o mês novo rende desde o dia 1, sobre o
  fechamento, só nos ativos com a flag ligada.
- **Job:** roda em `pnpm quotes:sync`, na função do Neon e no botão de
  desenvolvimento.
  - Busca o CDI e recalcula as posições com a flag no mês corrente e nos meses
    abertos.
  - **Taxa atrasada:** quando a taxa do último dia útil sai depois da virada,
    o job completa o fechamento do mês anterior, mesmo fechado, e leva o saldo
    à base do mês novo.
  - Um fechamento completo nunca é alterado: correções seguem sem cascata
    ([spec 057](057-movement-form-and-attribute-pencil.md)).
- **Formulário (aba Rateio), depois do ajuste 6:**
  - cada classificação Pós-fixado ou Prefixado tem, dentro do cartão dela,
    uma linha "Rentabilidade" com o campo à direita e o sufixo "% CDI" ou
    "% a.a.";
  - trocar a subclasse para outro indexador limpa a taxa da linha;
  - a flag "Calcular rendimento automaticamente" fica numa linha abaixo do
    rateio, uma por posição, e aparece quando alguma classificação é
    compatível;
  - na inclusão, a flag mostra ao lado o dia da aplicação ("Aplicado em").
- **Página da posição:**
  - selo com as taxas das classificações, como "100% do CDI · 12% ao ano ·
    automático";
  - painel com a base do mês, o rendimento calculado, o saldo bruto e "Rendeu
    até".

### Prefixado e metas

- A subclasse Prefixado existe na Renda Fixa e no Caixa.
- **Matriz de renda fixa do editor de metas:**
  - mostra todas as subclasses e resgates da lista;
  - os que faltam aparecem em 0% e são criados ao salvar.
- **Visão geral:** um item com meta 0 e sem saldo não aparece no gráfico nem em
  comprar e vender. O gráfico de resgate já ignorava subclasses sem saldo e sem
  meta.

### Movimentações

- **Filtros:** Todos, Aportes, Rendimentos, Retiradas e Saldo inicial.
  - Só aparecem os tipos que a posição tem, cada um com a contagem.
  - A [spec 080](080-position-actions-on-page-and-mobile-trims.md) passou o
    rendimento automático para um filtro próprio.

### Outros

- O ESLint passou a ignorar todas as pastas `.next-*` dos servidores de teste
  ([spec 072](072-dev-branch-and-local-tools.md)).
  - Com um servidor de teste rodando, `pnpm check` lia o build dele e acusava
    790 erros.
- O roteiro antigo da pausa (`scripts/test-manual-fixed-income.ts`) foi
  substituído pelo da 079, que mantém as conferências da liquidação manual e do
  backup.

## Verificação

Em 2026-10-06:

- **Checks:** `pnpm check` passou.
- **Testes unitários:** os 41 passaram, incluindo `tests/unit/auto-income.test.ts`.
  - Feriados de 2026 e os 21 dias úteis de outubro.
  - Prefixado com aporte e com retirada.
  - CDI × percentual.
  - A regra da flag.
- **Integração:** `scripts/test-auto-income.ts`, no schema isolado
  `auto_income_079`, apagado no fim, com CDI simulado.
  - A flag e a recusa sem taxa ou com rendimento manual.
  - Pós-fixado com aporte desde o dia dele.
  - Rendimento manual e retirada acima do saldo do dia recusados.
  - Prefixado de 21 dias úteis.
  - Desligar e religar.
  - Liquidação no dia do resgate, com acerto.
  - Liquidação manual da 076.
  - Backup, inclusive um arquivo sem os campos novos.
  - Virada.
  - Fechamento completado quando a taxa de 30/10 chega depois da virada.
  - **Defeito encontrado e corrigido:** um rendimento manual sem observação não
    impedia ligar o cálculo, porque no SQL `NOT LIKE` de nulo não é verdadeiro.
- **Depois do ajuste 6:**
  - o roteiro de integração passou de novo, com a taxa em cada classificação,
    a recusa de taxa numa subclasse incompatível e a taxa levada na virada;
  - os testes unitários passaram a cobrir duas classificações (60% a 100% do
    CDI e 40% a 12% a.a.) e a movimentação depois da última taxa;
  - **na interface:** a Caixinha com 60% a 100% do CDI e 40% a 12% a.a. foi a
    R$ 42.959,48, igual a 42.897,08 × (0,6 × 1,00050788 + 0,4 × 1,12^(1/252))³;
  - **suítes afetadas sobre os dados reais:** 110 aprovados, 71 pulados e
    nenhuma falha;
  - um teste antigo procurava a região "Movimentações", que deixou de existir
    quando a seção virou recolhível na spec 075. Ele só roda com mês aberto,
    por isso não tinha sido pego, e foi corrigido.
- **Interface:** num schema de teste com a carteira de demonstração, com
  outubro aberto.
  - A flag sem taxa mostra "Informe a rentabilidade…".
  - Com rendimento manual no mês, o servidor recusa.
  - **Caixinha 100% do CDI ligada, depois do job local:**
    - 42.897,08 × (1 + 0,050788%)³ = 42.962,47;
    - o CDI de 01, 02 e 05/10 veio do Banco Central.
  - **CDB prefixado de 12% aplicado em 01/10:** 10.013,50, igual a
    10.000 × 1,12^(3/252).
  - A linha automática fica sem lápis e sem lixeira.
  - "Movimentar" mostra só aporte e retirada.
  - As metas mostram o Prefixado.
- **e2e:** `tests/e2e/auto-income.spec.ts`.
  - Filtros com contagem.
  - Prefixado nas metas.
  - Sem item com meta e saldo zero na alocação.
  - Rentabilidade só na subclasse compatível, com a taxa exigida pela flag.
  - **Dados reais:** 7 aprovados e 3 pulados, sem mês aberto.
  - **Servidor de teste:** o cenário do formulário passou nos três perfis.

## Produção

- Publicada em 2026-10-06 com a spec 080: o build da Vercel aplicou as duas
  migrações e, depois, a função `quotesync` foi republicada com o cálculo novo
  (deployment 4). O registro e a conferência ficam em
  [Produção](../context/production.md).
- A migração deixou a flag desligada nos 69 ativos existentes; saldos,
  movimentações, bases e rateios foram preservados. O cálculo só liga por
  escolha do usuário no ativo.
- A execução do job pelo gatilho às 18h33 (Brasília) concluiu em 6 segundos,
  atualizando BTC e SOL, sem erro. O agendamento de hora em hora foi
  confirmado depois da conferência. Sem ativos habilitados, o job não
  calculou rendimento nesse teste.

## Fora do escopo

- IR e IOF: o valor é bruto.
- IPCA, Tesouro e previdência.

## Arquivos

- `prisma/schema.prisma` e as migrações `20261006150000_auto_income_and_fixed_rate`
  e `20261006190000_allocation_rate`
- `src/modules/portfolio/domain/business-days.ts`, `cdi-valuation.ts`,
  `fixed-income-policy.ts`, `classification.ts`, `default-targets.ts`
- `src/modules/portfolio/application/cdi-positions.ts`, `month-editing.ts`,
  `month-rollover.ts`, `position-transactions.ts`, `asset-attributes.ts`,
  `get-position-history.ts`, `get-month-positions.ts`, `get-editing-catalog.ts`,
  `get-target-editor.ts`, `target-plan-editing.ts`;
  `src/modules/portfolio/presentation/income-rate.ts`
- `src/modules/quotes/application/sync-quotes.ts`, `quote-sync-report.ts`
- `src/app/actions/edit-month.ts`
- `src/modules/portfolio/ui/position-form-dialog.tsx`,
  `position-transactions.tsx`, `position-transaction-dialog.tsx`,
  `position-detail.tsx`, `positions-workspace.tsx`, `cdi-panel.tsx`,
  `allocation-explorer.tsx`
- `tests/unit/auto-income.test.ts`, `tests/e2e/auto-income.spec.ts`,
  `tests/e2e/position-transactions.spec.ts`, `scripts/test-auto-income.ts`;
  `eslint.config.mjs`
