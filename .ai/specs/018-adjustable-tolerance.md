# 018 — Tolerância ajustável

Estado: concluída em 2026-10-02
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

## Verificação

Verificado em um banco local criado pelas migrações e carregado com a
importação do Excel. Com a tolerância padrão, a Visão Geral mostrou
"Itens dentro de ±2% ficam equilibrados", e o plano importado recebeu 2
pela migração, o mesmo valor que estava fixo no código. Pela interface, salvar 5,5 criou uma versão vigente
com 5,50, a Visão Geral passou a mostrar ±5,5% e as 38 metas mantiveram a
origem no Excel; "Restaurar padrão do Excel" voltou a tolerância para 2 e
salvou outra versão. No servidor, 25, -1, 2,555 e texto não numérico foram
recusados, e reenviar o plano vigente sem mudanças também.

O novo cenário do Playwright altera a tolerância, confere que a contagem
fora da meta muda na prévia, que 25 bloqueia o salvamento e que descartar
restaura o valor, sem gravar. A suíte completa passou com 19 cenários e um
pulado intencionalmente. `pnpm check` e `pnpm build` passaram.

Ao atualizar o ambiente local: aplicar a migração, rodar `pnpm db:generate`
e reiniciar o `pnpm dev`, conforme o achado registrado na spec 014.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
- [Configuração da carteira](014-target-settings.md)
