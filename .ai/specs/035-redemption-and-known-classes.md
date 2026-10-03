# 035 — Resgate fixo e classes existentes no rateio

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Respostas do usuário em 2026-10-02 (terceira rodada), registradas em
[Reestruturação da UX](../context/ux-restructure.md):

- a duração da planilha é o prazo de resgate. Pedido: tratar esse campo como
  "Resgate", com Curto, Médio, Longo ou Nenhum, e deixar a subclasse como
  está, podendo receber valores novos;
- no rateio, aceitar "somente as classes existentes, por hora".

## Comportamento

- o terceiro campo de cada classificação do rateio passa a se chamar
  "Resgate", com uma lista fixa: Curto, Médio, Longo e Nenhum. "Nenhum" grava
  o "-" que os dados importados já usavam (`REDEMPTION_VALUES`, em
  `src/modules/portfolio/domain/redemption.ts`);
- um prazo antigo da posição, como D+0 ou D+1, aparece na lista marcado "da
  planilha" e pode continuar até ser trocado; os dados antigos não mudam, e a
  revisão deles fica para o [passo pré-produção](../context/pre-deploy.md);
- a classe só aceita as já cadastradas, nos rateios ou nas metas; digitar outra
  não oferece "Usar" e mostra "Nenhuma classe com esse nome";
- a subclasse continua aceitando um valor novo, confirmado em "Usar";
- vale no rateio da posição e no rateio inicial da inclusão;
- o servidor confere as mesmas regras (`assertAllocationRules`) e recusa, por
  exemplo, "A classe Classe nova não existe" e "Resgate inválido: D+5";
- o rateio inicial de saldos em reais e em dólar passou de D+0 para Curto;
- os títulos mudaram: "Renda fixa por resgate" na Visão Geral e "Renda fixa:
  subclasse × resgate" na configuração.

## Verificação

- `tests/e2e/styled-pickers.spec.ts`: a classe não oferece "Usar", a
  subclasse aceita "Subclasse nova" e o resgate lista Curto, Médio, Longo e
  Nenhum; `tests/e2e/new-position-entities.spec.ts` escolhe o resgate na
  inclusão de renda fixa;
- servidor, com a transação desfeita: classe nova e resgate D+5 recusados, e o
  rateio do Bitcoin 01 ficou intacto;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Listas de seleção estilizadas](025-styled-pickers.md)
- [Visão Geral: duração, variação no período e hover](024-overview-adjustments.md)
