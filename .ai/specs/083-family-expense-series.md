# 083 — Parcelas e lançamentos mensais em Gastos familiares

Estado: concluída localmente em 2026-10-07; aguarda aprovação de commit e
deploy.
Origem: resposta do usuário em 2026-10-07: "ao criarmos uma pendência que
seja recorrente, nós conseguimos delimitar o número de parcelas a se pagar e
ele já gera os meses seguintes; se eu quiser editar aquele gasto, consigo
editar novamente as parcelas e valores, um CRUD padrão, tudo numa única
página; pode reutilizar o componente de data".

## Regras

- **Criar:** no formulário do lançamento, "Repetir" escolhe Não, Parcelado ou
  Mensal e a quantidade (2 a 120). A série gera na hora todas as competências,
  uma por mês a partir do primeiro mês, com o valor informado em cada uma,
  todas Pendentes.
  - Parcelado mostra "Descrição (i/N)", com o N atual da série;
  - Mensal repete a mesma descrição, como um streaming.
- **Editar um lançamento:** muda só ele, mesmo dentro da série (inclusive o
  status).
- **Editar a série** ("Série inteira" no mesmo formulário): descrição, pessoa,
  tipo, valor, quantidade, mês inicial e Parcelado/Mensal.
  - os pendentes recebem os dados novos e a competência pela posição;
  - os acertados não mudam nem saem; a série não fica menor que o maior
    número acertado, e o mês inicial só muda sem acertados;
  - aumentar cria os números além da quantidade anterior; diminuir exclui os
    pendentes além da nova; um número excluído antes, um a um, não volta.
- **Excluir:** o lançamento sozinho, ou "Excluir pendentes" da série, que
  mantém os acertados; uma série sem lançamentos sai junto. Os dois têm
  Desfazer.
- **Idempotência:** o navegador escolhe o id do pedido ao abrir o formulário;
  repetir o envio (duplo clique, nova tentativa ou em paralelo) encontra o id
  gravado e não duplica. A pessoa nova criada por dois pedidos simultâneos é
  resolvida na nova tentativa, sem confundir com repetição.
- **Sem suposições:** nada é gerado a partir de descrições importadas como
  "(1/2)" ou "Spotify"; o histórico existente não vira série.
- **Campo de mês:** `MonthPicker`, acrescentado ao campo de data do design
  system (`src/components/ui/date-picker.tsx`): digita MM/AAAA ou escolhe na
  grade dos meses, com o ano navegável e "Mês atual".

## Verificação

- Unitários: meses gerados, rótulo (i/N), edição com acertados protegidos,
  mês inicial travado, números excluídos que não voltam.
- Integração: 4 parcelas criadas; com a 1 acertada, reduzir para 3 atualizou
  2 e excluiu 1; quantidade zero e mudança de mês recusadas; aumentar para 5
  criou 2; excluir pendentes manteve a acertada; desfazer devolveu as 5.
- Navegador: "Bicicleta teste" 3 × R$ 150,00 de Out/26 a Dez/26 (prévia com
  período e total); depois de acertar a 1/3, a série com 5 × R$ 160,00 manteve
  a 1/5 em R$ 150,00 acertada e criou as 4 e 5.
- E2E (com `E2E_FAMILY_WRITES=1`, schema de teste): parcelado em 3, acerto em
  lote dos 3 com a lista e o saldo (+R$ 37,02), desfazer e exclusão.
