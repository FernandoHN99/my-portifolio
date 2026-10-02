# 018 — Tolerância ajustável

Estado: em andamento
Definida em: 2026-10-02

## Problema

A faixa que marca um item como equilibrado está fixa em dois pontos
percentuais no código desde a [spec 012](012-rebalancing-in-overview.md). O
usuário decidiu em 2026-10-02 que ela deve ser configurável na tela de
Configuração.

## Objetivo

Permitir ajustar a tolerância junto com as metas, com o mesmo fluxo de
rascunho, prévia e salvamento da [spec 014](014-target-settings.md).

## Decisões tomadas

- a tolerância é um atributo do plano de metas, na coluna
  `rebalance_tolerance` de `target_plans`, em pontos percentuais; a migração
  `rebalance_tolerance` é aditiva, com padrão 2, e o plano existente recebe 2,
  preservando os números atuais;
- como as metas, a tolerância é global: a vigente vale para todos os meses,
  inclusive os passados;
- alterar só a tolerância também cria uma nova versão do plano, com as metas
  copiadas, para que o histórico registre quando ela mudou;
- o valor aceito vai de 0 a 20 pontos, com até duas casas decimais; o
  servidor revalida o limite;
- "Restaurar padrão do Excel" volta a tolerância para 2, o valor usado desde
  a spec 012, já que a planilha não tinha tolerância;
- o cálculo continua sendo `buildAllocationGroups`, que passa a receber a
  tolerância; a Visão Geral usa a do plano vigente e a prévia usa a do
  rascunho.

## Interface

- cartão "Tolerância" na Configuração, antes dos grupos de metas, com campo
  numérico e deslizante;
- a alteração entra no mesmo rascunho das metas: conta como alteração
  pendente, atualiza a prévia na hora e é salva ou descartada junto;
- o texto da Visão Geral que explica a faixa passa a mostrar o valor vigente.

## Fora do escopo

- tolerância diferente por grupo ou por categoria;
- Previdência.

## Critérios de aceite

- com a tolerância padrão, a Visão Geral mostra os mesmos números de antes;
- aumentar a tolerância na Configuração reduz na prévia a contagem de itens
  fora da meta, sem gravar;
- salvar cria uma versão vigente com a nova tolerância, e a Visão Geral passa
  a usá-la;
- valores fora de 0 a 20 bloqueiam o salvamento e são recusados no servidor;
- lint, tipos, build e testes de interface passam.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
- [Configuração da carteira](014-target-settings.md)
