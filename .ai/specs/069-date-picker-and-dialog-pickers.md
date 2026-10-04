# 069 — Campo de data do design system e listas do diálogo de movimentação

Estado: implementada e validada localmente em 2026-10-05. Sem commit ou deploy.
Origem: pedidos do usuário em 2026-10-04: "verificar todos os picklists desse
novo dialog para seguir o padrão do projeto" e "estilize todos os componentes de
data para o nosso design system".

## Listas

- O diálogo de movimentação da [spec 066](066-guided-position-and-movement-dialogs.md)
  usava `<select>` nativo em três escolhas: o movimento, como informar e o novo
  total em quantidade ou valor de mercado. As três passam ao `Picker` do
  projeto, o mesmo da inclusão de posição e dos filtros.
- No movimento, cada opção traz uma dica à direita: "entrou dinheiro novo",
  "saiu dinheiro" e "retorno do investimento".
- Conferidos os demais diálogos: inclusão, lápis, liquidação e rateio já usavam
  `Picker`.

## Campo de data

`DatePicker` (`src/components/ui/date-picker.tsx`) substitui os três
`<input type="date">` do app: o dia da movimentação, o dia da liquidação e o
vencimento.

- O valor continua em AAAA-MM-DD; a tela mostra DD/MM/AAAA.
- Digitar só os números põe as barras sozinho. Uma data completa fora do
  intervalo fica marcada como inválida e não é aceita.
- O botão do calendário abre um popover no estilo das listas:
  - meses em português, semana a partir do domingo e hoje destacado;
  - dias fora do intervalo bloqueados;
  - clicar no título troca para a escolha do ano, útil para vencimentos distantes;
  - "Hoje" e, nas datas opcionais, "Limpar".
- Teclado: setas andam dias e semanas, PageUp e PageDown andam meses (com Shift,
  anos), Home e End vão ao início e ao fim da semana, Enter escolhe e Escape
  fecha.
- O campo de texto segue a regra de 16 px em telas de toque (spec 031). O
  calendário cabe na largura do iPhone e abre para cima quando falta espaço.

## Verificação

Em 2026-10-05:

- `tests/e2e/types-and-dates.spec.ts`:
  - sem `input[type="date"]` no diálogo;
  - o calendário escolhe o dia 1;
  - "01011999" vira "01/01/1999" e fica inválido.
- `position-transactions.spec.ts`, `position-form.spec.ts` (vencimento digitado
  como 15/01/2027) e `treasury-position.spec.ts` foram adaptados às listas e ao
  campo novos e passaram no Chrome.
- Capturas no desktop e no iPhone 16 Plus (WebKit) do calendário da
  movimentação e do vencimento, da lista do movimento e do tipo no lápis.

## Arquivos

- `src/components/ui/date-picker.tsx`
- `src/modules/portfolio/ui/position-transaction-dialog.tsx`,
  `liquidation-dialog.tsx`, `position-form-dialog.tsx`
