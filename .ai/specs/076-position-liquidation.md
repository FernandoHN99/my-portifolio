# 076 — Liquidação de posições: retirada total que preserva o histórico

Estado: implementada e validada localmente em 2026-10-05; na `dev`, ainda fora
da produção. O backup v3 foi restaurado só na carteira local.
Origem: pedido do usuário em 2026-10-05.

## Regra do usuário

- Uma retirada que zera a posição a **liquida**.
  - No mês seguinte, ela não aparece entre as posições ativas nem entra no
    patrimônio, como se não existisse mais.
  - O histórico dela continua, sem perder os dados antigos.
- **Apagar ≠ liquidar.**
  - Apagar remove o registro.
  - Liquidar encerra a posição ativa com uma retirada total e preserva a
    existência histórica.
- Na planilha, a posição que acabava "sumia", porque o registro era apagado.
  Agora toda posição que existiu e deixou de existir, inclusive as que saíram e
  voltaram, termina com uma retirada total no mês da saída.
- A mudança altera dados vistos hoje, o que é esperado; o resto precisa
  continuar coerente.
- A estrutura prepara cards e métricas de posições liquidadas no futuro.

## Decisões

O usuário não respondeu às perguntas desta rodada. Os pontos abaixo seguem as
opções recomendadas e ficam abertos para revisão.

### No app

- **Liquidar, para qualquer posição** com saldo no mês aberto:
  - na página da posição, ao lado de Movimentar;
  - na tabela de Posições, junto das ações da linha;
  - dentro do diálogo de remover, como alternativa.
- **O diálogo** pede o dia e o valor recebido. O padrão é o saldo do mês.
  - Num saldo em reais, uma diferença vira rendimento antes da retirada,
    negativo quando chega menos, como imposto retido.
  - Num ativo cotado, a diferença fica no preço executado da venda.
  - Não há conta de destino: a liquidação com conta corrente da
    [spec 059](059-cash-account-and-liquidation.md) saiu junto com a
    opção do formulário ([spec 075](075-position-page-cleanup-and-month-strip.md)).
  - Liquidações antigas com pernas ligadas (`transferId`) continuam legíveis e
    saem juntas ao apagar.
- **Sem cascata:** liquidar num mês que ainda tem a posição no mês seguinte é
  recusado, com a orientação de liquidar no último mês em que ela aparece.
- **No mês da saída**, a posição aparece:
  - na tabela de Posições, com o selo "Liquidada" e a linha atenuada;
  - na contagem, como "N posições · 1 liquidada";
  - na página dela, com o selo "Liquidada em DD/MM/AAAA";
  - no mês a mês, com "Liquidada".
- **A virada de mês** já não levava posições zeradas
  ([spec 059](059-cash-account-and-liquidation.md)).
- **A Visão geral e a alocação** leem só posições com quantidade, então a
  liquidada fica fora do patrimônio e das contagens.
- **Volta:** uma posição que volta no mês seguinte a uma liquidação aparece como
  "Volta" no mês a mês.
- **Remover** continua apagando o registro do mês. A confirmação diz isso e
  oferece Liquidar.

### Rendimento com o lucro realizado

Sem isso, toda posição liquidada mostraria rendimento zero, porque o valor e o
aplicado ficam zerados.

- **Fórmula:** valor da posição − valor aplicado + lucro realizado.
- **Lucro realizado** de cada retirada: o valor dela menos o custo médio que ela
  tira. Ele soma em toda a vida da posição, inclusive antes de uma saída e
  volta.
- **Saldos em reais:** o rendimento passa a ser todo o rendimento da posição, e
  não só o que ficou nela. Um CDB com retiradas, por exemplo, mostra todos os
  rendimentos dele, e não só a parte que continua aplicada.
- **Ativos cotados:** a venda acima do preço médio entra como ganho. Num caixa
  em dólar, entra a variação do câmbio.
- **No domínio** (`position-history.ts`):
  - `applyMovements` devolve o realizado do mês;
  - cada mês guarda `realizedBrl`, `gainBrl`, `liquidated` e `liquidatedOn`.

### Dados históricos (backup v3)

- **Base:** a v2 ([spec 071](071-backup-with-movements.md)).
- **Liquidações:** para cada posição que existia num mês e não existe no
  seguinte, uma linha no mês da saída, com base no último saldo, quantidade zero
  e uma retirada total.
- **Rateio e estratégia:** copiados do último mês.
- **Dia e valor:** a retirada fica no dia 1 desse mês, pelo último saldo e
  preço anotados.
  - A planilha e o relatório do Inter (só posições atuais) não têm o dia nem o
    valor real do resgate.
  - Assim, nenhum rendimento é inventado: a variação do mês da saída é toda
    retirada.
- **Observação:** "Liquidação convertida do histórico mensal".
- **Total:** 36 liquidações em 32 posições.
  - Quatro posições saíram e voltaram: Bitcoin 02, USDT, Dolar Inter e Time
    Deposit. Têm uma liquidação por saída.
  - As voltas continuam como aportes.
- **Formato:** continua na versão 5; não houve mudança no banco.

## Verificação

Em 2026-10-05:

- **Teste unitário** `tests/unit/position-applied.test.ts`, com 6 cenários:
  - liquidação de saldo em reais (selo, dia, aplicado zero, resultado
    realizado, nada sem registro);
  - liquidação de ativo cotado sem efeito de preço inventado;
  - realizado nas retiradas parciais.
- **Roteiro de integração** `scripts/test-manual-fixed-income.ts`, num schema
  isolado (apagado depois):
  - liquidação pelo saldo, abaixo e acima dele;
  - sem conta de destino e sem liquidar duas vezes;
  - desfazer apagando as pernas.
- **Conferência com as funções do domínio**, sobre a v2 e a v3:
  - v3: 51 posições, 493 meses, nenhum problema. Todo mês registrado, com
    aplicado e rendimento, saldo de partida positivo e preço médio nos cotados;
    nenhuma diferença acima de R$ 0,05; toda saída liquidada e coerente.
  - v2: as 36 saídas sem liquidação, que a v3 corrige.
  - Entre v2 e v3, valor da posição, valor aplicado, saldo de partida e
    patrimônio de cada mês ficaram iguais. Só o rendimento mudou, em 51 meses de
    4 posições: as que saíram e voltaram passam a contar o realizado antes da
    saída.
- **Restauração local:** a v3 foi restaurada na carteira local depois de
  exportar a anterior.
- **e2e `position-history.spec.ts`**, nos três perfis:
  - Bitcoin 02 liquidado em mar/2024 e de volta em abr/2024;
  - USDC da Binance liquidado em out/2025;
  - LCI BRB liquidada na tabela de out/2026 e ausente em set/2026;
  - rendimento de todas as contas do USDC com o realizado.

## Arquivos

- `src/modules/portfolio/domain/position-history.ts`
- `src/modules/portfolio/application/position-transactions.ts`,
  `get-month-positions.ts`, `get-overview-data.ts`,
  `get-allocation-overview.ts`
- `src/app/actions/edit-month.ts`
- `src/modules/portfolio/ui/liquidation-dialog.tsx`, `positions-workspace.tsx`,
  `position-detail.tsx`, `position-months-table.tsx`,
  `position-evolution-chart.tsx`
- `scripts/test-manual-fixed-income.ts`, `tests/unit/position-applied.test.ts`

Fora do Git:

- `backups/meu-portfolio-backup-2026-10-05-movimentacoes-v3.json`: o backup em
  uso (v3).
- `backups/revisao-liquidacoes-2026-10-05-v3.md`: cada liquidação, com o mês, o
  último mês e o valor.
- `backups/copias-de-seguranca/local-antes-da-v3-2026-10-05.json`: a carteira local antes da v3.
- O roteiro da conversão ficou fora do repositório, porque leva nomes dos
  ativos.

## Depois da entrega (2026-10-06)

- **Arquivo trocado na importação:**
  - O usuário importou na carteira local dele o arquivo mais recente da pasta,
    `local-antes-da-v3-2026-10-05.json`, que era a cópia de segurança da v2, e
    não a v3. A conta dele ficou sem as liquidações.
  - A conta dele foi exportada para
    `backups/copias-de-seguranca/sua-conta-antes-da-v3-2026-10-06.json` e
    recebeu a v3: 493 posições mensais, 36 liquidações.
  - As cópias de segurança passaram para `backups/copias-de-seguranca/`, para o
    backup em uso ser o arquivo mais recente da pasta.
- **A produção continua com a v2.** A v3 só faz sentido lá depois de publicar
  as specs 075 a 077: com o código anterior, as liquidações apareceriam como
  posições de valor zero, sem o selo.
- **Selo em qualquer mês:** na página de uma posição que terminou liquidada, o
  selo "Liquidada em DD/MM/AAAA" aparece em qualquer mês dela e leva ao mês da
  saída. As movimentações listam só até o mês selecionado, então antes disso a
  retirada não aparecia. Uma posição liquidada que voltou depois mostra o selo
  só no mês da liquidação.
