# 032 — Finalizar o mês corrente

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Resposta do usuário em 2026-10-02 sobre os meses gerados pela virada
automática ([spec 021](021-automatic-month-rollover.md)), registrada em
[Reestruturação da UX](../context/ux-restructure.md): os meses atuais ficam em
rascunho, e seria bom poder deixar o mês atual como finalizado, de modo que
editá-lo exija o mesmo que os meses anteriores. A rotina dele: no começo do
mês ajusta os aportes e depois só acompanha.

## Comportamento

- a competência mais recente em rascunho mostra "Finalizar mês" no cabeçalho
  de Posições. A confirmação explica que, finalizado, editar posições e
  cotações daquele mês pede a mesma confirmação dos meses passados e que as
  cotações continuam sendo atualizadas;
- finalizada, a competência passa ao status `REVIEWED`, com o selo
  "Finalizado" no lugar de "Rascunho" (Posições, Cotações, Visão Geral e
  página da posição), o aviso "está finalizado e travado para edição" e a
  confirmação "Editar mesmo assim" antes de editar posições, incluir posição
  ou editar cotações;
- "Reabrir mês" devolve a competência a rascunho;
- o servidor também trava: `assertEditable` recusa alterar uma competência
  finalizada sem a confirmação, e `setMonthFinalized` só finaliza ou reabre a
  competência mais recente;
- a atualização de cotações continua reprecificando o mês corrente
  finalizado: finalizar trava as edições manuais, não os preços.

## Decisões tomadas

- usa o status `REVIEWED`, que já existia no esquema e não era usado, sem
  migração;
- as competências importadas da planilha não oferecem finalizar: elas já são
  passadas e travadas;
- um selo único (`MonthStatusBadge`) substitui as quatro cópias do selo de
  rascunho.

## Verificação

- navegador, nos dados reais: Out/26 finalizado mostrou "Finalizado", o aviso
  de trava, "Reabrir mês" e, ao editar, a confirmação "Out/26 está
  finalizado..."; reabrir devolveu "Rascunho" e o status `DRAFT` no banco;
- `tests/e2e/finalize-month.spec.ts`: o diálogo de finalizar abre e cancela no
  mês em rascunho, e Set/26 não oferece finalizar;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Modo de edição com lápis](019-pencil-edit-mode.md)
- [Virada de mês automática](021-automatic-month-rollover.md)
