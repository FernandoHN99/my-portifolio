# 039 — Prazo de liquidez do ativo

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03 (quarta rodada): "crie uma nova coluna (não
é obrigatório) referente ao tempo de liquidez do ativo (geralmente mais
utilizado relacionado à renda fixa) D+0, D+1, imediato etc., deixar subclasse
sem esses valores".

## Comportamento

- o ativo ganhou o campo opcional `liquidity` (migração
  `20261003010000_asset_liquidity`), diferente do vencimento e do resgate
  Curto, Médio e Longo do rateio;
- sugestões: Imediata, D+0, D+1, D+2, D+30, D+90 e No vencimento; outro valor
  pode ser digitado ("Usar"), e "d+ 1" é gravado como "D+1"
  (`src/modules/portfolio/domain/liquidity.ts`);
- Posições: coluna "Liquidez" a partir de 1.280 px e filtro "Liquidez"
  (parâmetro `liq`), com "Sem liquidez informada", dentro da cascata da
  [spec 031](031-positions-cascading-filters.md);
- página da posição: "Liquidez" nos destaques, editável pelo lápis para
  qualquer ativo (`saveAssetLiquidityAction`);
- inclusão de ativo novo: campo "Liquidez (opcional)".

## Fora do escopo

Os valores D+0 e D+1 que estão no resgate dos rateios importados não foram
movidos para a liquidez: isso fica para o
[passo pré-produção](../context/pre-deploy.md), junto da revisão dos dados
antigos.

## Verificação

- servidor: salvar " d+ 1 " na Porquinho gravou "D+1"; remover devolveu
  nulo, o estado original;
- testes: coluna e filtro de liquidez; o editor da página da posição abre com
  as sugestões e cancela sem gravar;
- `pnpm check` e a suíte do Playwright (uma falha intermitente de clique antes
  da hidratação, corrigida no teste).

## Nota de ambiente

Depois de `pnpm db:generate`, o servidor de desenvolvimento precisa reiniciar
para usar o cliente Prisma novo; sem isso, Posições mostrava "Nenhuma posição
nesta competência". Tocar o `next.config.ts` reinicia o servidor sem fechar o
`pnpm dev`.
