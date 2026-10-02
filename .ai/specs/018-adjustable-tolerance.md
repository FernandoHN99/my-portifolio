# 018 — Faixa de tolerância ajustável

Estado: em andamento
Definida em: 2026-10-02

## Problema

A faixa que marca um item como equilibrado está fixa em dois pontos
percentuais no código. O usuário pediu, em 2026-10-02, que ela seja
ajustável na configuração da carteira que já existe.

## Objetivo

Permitir definir a tolerância junto das metas, com efeito imediato na prévia
e, depois de salva, em todas as análises de comprar e vender.

## Escopo

- a tolerância é guardada no plano de metas, ao lado dos percentuais, e
  segue o mesmo versionamento: alterar a tolerância cria uma nova versão;
- o plano importado do Excel começa com dois pontos percentuais, o valor que
  já estava em uso;
- a configuração exibe a tolerância com campo numérico e deslizante;
- a prévia de comprar e vender usa a tolerância em edição;
- a Visão Geral passa a usar a tolerância vigente na tabela de comprar e
  vender e no indicador de itens fora da meta;
- valores aceitos de 0 a 20 pontos percentuais, com até duas casas decimais.

## Fora do escopo

- tolerâncias diferentes por grupo ou por categoria.

## Critérios de aceite

- salvar apenas a tolerância cria uma nova versão vigente;
- a prévia muda a classificação entre comprar, vender e equilibrado ao
  alterar a tolerância;
- a Visão Geral reflete a tolerância salva;
- valores fora do intervalo são recusados no cliente e no servidor;
- lint, tipos, build e testes de interface passam.

## Andamento em 2026-10-02

Feito: coluna `tolerance_percent` em `target_plans` (padrão 2), migração
`adjustable_tolerance` aplicada no banco local e cliente regenerado. O plano
do Excel ficou com 2,00. Nada foi commitado.

Falta, nesta ordem:

1. `domain/rebalance.ts`: receber a tolerância em `buildAllocationGroups` e
   no cálculo da direção, mantendo 2 como padrão;
2. `get-allocation-overview.ts`: ler `tolerancePercent` do plano vigente e
   devolvê-lo; `get-overview-data.ts` deve usá-lo em `offTargetTolerance`;
3. `get-target-editor.ts` e `target-plan-editing.ts`: expor e gravar a
   tolerância, validar de 0 a 20 com duas casas e considerar a mudança dela
   como alteração do plano; a ação `saveTargetPlanAction` passa a receber um
   objeto com metas e tolerância;
4. `target-editor.tsx`: cartão de tolerância com campo e deslizante, ligado à
   prévia e à barra de alterações;
5. teste do Playwright sem gravação; verificação com gravação em banco
   temporário; reiniciar o `pnpm dev` após a migração.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Configuração da carteira](014-target-settings.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
