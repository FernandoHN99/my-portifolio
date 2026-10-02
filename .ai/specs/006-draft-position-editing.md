# 006 — Edição das posições do rascunho

Estado: concluída em 2026-10-01; substituída pela spec 017 em 2026-10-01
Definida em: 2026-10-01

A regra de editar somente o rascunho, o editor em `/carteira/editar` e sua
ação foram substituídos pela [edição na aba de posições](017-positions-editing.md),
que permite editar a competência mais recente livremente e as passadas com
confirmação. O registro abaixo preserva a origem da decisão.

## Problema

A atualização mensal copia as posições e atualiza seus preços, mas o usuário
ainda precisa ajustar manualmente as quantidades e os saldos que mudaram no
mês. Sem essa etapa, o rascunho não substitui o fluxo de edição do Excel.

## Objetivo

Permitir a edição segura das posições da competência em rascunho, preservando
a separação por instituição e conta e recalculando o patrimônio antes e depois
do salvamento.

## Regras

- somente competências com estado `DRAFT` podem ser alteradas;
- ativos com símbolo de cotação recebem uma nova quantidade e reutilizam o
  preço em BRL obtido pela atualização mensal;
- posições sem símbolo recebem um saldo manual em BRL;
- saldos manuais mantêm quantidade e total iguais, compatíveis com a estrutura
  importada do Excel;
- valores devem ser finitos, não negativos e enviados para posições que
  pertençam ao rascunho informado;
- toda a lista é validada antes da transação; nenhuma alteração parcial é
  persistida;
- o servidor recalcula os totais com `Decimal`, sem confiar no valor prévio
  apresentado pelo navegador;
- esta fatia edita posições existentes. Inclusão, remoção e fechamento mensal
  serão especificados separadamente.

## Interface

- resumo da competência, patrimônio recalculado e quantidade de mudanças;
- posições agrupadas visualmente por custódia, sem misturar contas;
- quantidade para ativos cotados e saldo atual para posições manuais;
- preço e novo total visíveis como contexto, sem torná-los editáveis;
- barra de ação persistente com feedback de salvamento e erros.

## Critérios de aceite

- uma competência importada ou revisada não pode ser editada;
- alterar uma quantidade recalcula o total usando o preço persistido;
- alterar um saldo manual atualiza quantidade e total na mesma transação;
- valores inválidos não causam atualização parcial;
- visão geral e editor exibem os novos totais após salvar;
- lint, tipos, build e testes de interface passam.

## Verificação

Um banco temporário foi recriado desde a primeira migração, recebeu a
importação e a normalização do Excel e gerou um rascunho com provedores
simulados. A edição alterou uma quantidade cotada e um saldo manual entre as 21
posições. Os totais resultantes conferiram com o cálculo decimal esperado.

Uma segunda tentativa contendo um valor inválido foi recusada sem modificar
nenhuma posição. Uma competência importada também foi rejeitada pela regra de
domínio. O banco temporário foi removido ao fim da verificação.

A interface foi revisada em desktop e mobile, e o fluxo de navegação passou nos
dois projetos do Playwright.

## Referências

- [Atualização mensal manual](003-manual-monthly-update.md)
- [Domínio inicial da carteira](005-portfolio-domain.md)
