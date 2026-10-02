# 018 — Faixa de tolerância ajustável

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

A faixa que marca um item como equilibrado estava fixa em dois pontos
percentuais no código desde a [spec 012](012-rebalancing-in-overview.md). O
usuário pediu, em 2026-10-02, que ela seja ajustável na configuração da
carteira que já existe.

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

- tolerâncias diferentes por grupo ou por categoria;
- Previdência.

## Decisões tomadas

- a tolerância fica na coluna `tolerance_percent` de `target_plans`, criada
  pela migração aditiva `adjustable_tolerance` com padrão 2;
- como as metas, a tolerância é global: a vigente vale para todos os meses,
  inclusive os passados;
- a tolerância entra no mesmo rascunho das metas: conta como alteração
  pendente, atualiza a prévia na hora e é salva ou descartada junto; salvar só
  a tolerância cria uma nova versão com as metas copiadas;
- "Restaurar padrão do Excel" volta a tolerância para 2, o valor usado desde
  a spec 012, já que a planilha não tinha tolerância;
- `buildAllocationGroups` recebe a tolerância; a Visão Geral usa a do plano
  vigente e a prévia usa a do rascunho;
- o servidor recusa valores fora do intervalo, com mais de duas casas
  decimais ou não numéricos, e também um plano idêntico ao vigente;
- o texto da Visão Geral que explica a faixa mostra o valor vigente em pt-BR,
  por exemplo "±5,5%".

## Critérios de aceite

- salvar apenas a tolerância cria uma nova versão vigente;
- a prévia muda a classificação entre comprar, vender e equilibrado ao
  alterar a tolerância;
- a Visão Geral reflete a tolerância salva;
- valores fora do intervalo são recusados no cliente e no servidor;
- lint, tipos, build e testes de interface passam.

## Verificação

A migração e o esquema foram criados na máquina do usuário; a implementação
foi feita em uma sessão separada, que adotou essa mesma migração ao mesclar
os dois trabalhos.

Verificado em um banco local criado pelas migrações e carregado com a
importação do Excel. Com o padrão, a Visão Geral mostrou "Itens dentro de ±2%
ficam equilibrados". Pela interface, salvar 5,5 criou uma versão vigente com
5,50, a Visão Geral passou a mostrar ±5,5% e as 38 metas mantiveram a origem
no Excel; "Restaurar padrão do Excel" voltou a tolerância para 2 e salvou
outra versão. No servidor, 25, -1, 2,555 e texto não numérico foram
recusados, assim como reenviar o plano vigente sem mudanças.

O novo cenário do Playwright altera a tolerância, confere que a contagem fora
da meta muda na prévia, que 25 bloqueia o salvamento e que descartar restaura
o valor, sem gravar. `pnpm check`, `pnpm build` e a suíte do Playwright
passaram.

Ao atualizar o ambiente local: aplicar as migrações, rodar `pnpm db:generate`
e reiniciar o `pnpm dev`, conforme o achado registrado na spec 014.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Configuração da carteira](014-target-settings.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
