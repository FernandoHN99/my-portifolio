# 094 — Horas do mês em Recebimentos (modelo e arquivo de carga)

Estado: implementada e conferida localmente em 2026-10-08, sem commit nem
publicação. Nenhuma tela mostra as horas (pedido do usuário); o dado só existe
no banco e no backup.

Atualização (spec 098, 2026-10-08/09): as horas declaradas e trabalhadas saíram
da linha do holerite (são do mês de trabalho, outra competência). As horas
extras declaradas e pagas vivem agora nas Horas extras
([spec 098](098-overtime-control.md)), com o pagamento registrado por mês de
trabalho; esta tabela continua sem tela, como a transcrição dos holerites de
2026, e dá a base do valor da hora normal.

Origem: pedido do usuário em 2026-10-08, com os 11 PDFs dos holerites de 2026
(Amaris, jan a set): analisar todos, gerar o arquivo de carga completo para o
banco local e, depois, a produção, e modelar as horas, porque "declaro umas
horas e recebo mais ou menos".

## Decisões do usuário (2026-10-08)

- **Granularidade:** total do mês por tipo de hora, não por dia. O controle
  diário pode entrar depois como tabela nova, sem mexer nesta.
- **Escopo do holerite:** só as horas e o valor pago de cada uma. DSR, IR, INSS,
  FGTS e o demonstrativo completo ficam fora do modelo por enquanto.
- **13º de junho:** o adiantamento (R$ 5.542,85, pago em 30/06) entra como
  linha "13º salário" de junho.
- **Correções do arquivo (mesmo dia, depois da primeira entrega):** (1) o líquido
  de julho passa a ser o do holerite, R$ 9.106,65, no lugar dos R$ 9.106,55 da
  planilha; (2) setembro não duplica as férias; (3) as horas normais de março a
  maio ficam em 200 h sem nota de inferência, porque as normais são só as horas
  que não são extras e pesam pouco no cálculo.

## Modelo

Tabela `income_hour_records` (`IncomeHourRecord`, migração
`20261008150000_income_hour_records`), uma linha por mês e tipo
(`@@unique([incomeMonthId, kind])`), com as chaves compostas com o usuário das
outras tabelas da área e exclusão em cascata com o mês:

| Campo | Significado |
|---|---|
| `kind` (`HourKind`) | `NORMAL`, `OVERTIME_50`, `OVERTIME_75` ou `OVERTIME_100` |
| `declaredHours` | horas que o usuário declarou à empresa |
| `paidHours` | horas da linha do holerite (a referência dela) |
| `workedHours` | horas que o usuário realmente trabalhou, pelo controle dele |
| `paidAmount` | valor em reais da linha do holerite, sem o DSR |
| `note` | observação livre (de onde veio a hora, o que foi inferido) |

Horas são `Decimal(7,2)`; valor, `Decimal(12,2)`. Todos os quatro são opcionais:
nulo é "não informado", diferente de zero (como nos valores do mês). O banco
garante horas entre 0 e 744 (um mês de 31 dias) e valor não negativo (CHECKs na
migração, o Prisma não os declara). O desvio declarado × pago × trabalhado é
derivado quando a tela existir; nada é guardado.

- **Escopo por usuário:** `IncomeHourRecord` entra em `OWNED_MODELS`
  (`src/lib/user-db.ts`). Sem isso, as leituras pelo cliente com escopo não
  filtrariam por usuário.
- **Excluir o mês e desfazer** (`income-editing.ts`): as horas saem em cascata,
  então o retrato do desfazer passou a guardá-las e a gravá-las de volta. Salvar
  o mês troca só os holerites; as horas ficam.
- **Sem escrita pela interface:** não há tela, ação nem rota que grave horas.
  Hoje elas entram pelo backup (ou direto no banco).

## Backup de Recebimentos, versão 2

(A [spec 095](095-payslip-taxable-flag.md) levou o formato à versão 3, com
`taxable` nos holerites; o arquivo desta spec foi atualizado para ela e a
versão 2 continua aceita.)

- `INCOME_BACKUP_VERSION` passou a 2, com a tabela `incomeHourRecords`
  (rótulo "Horas") depois de `incomePayslips`; a ordem de gravação respeita a
  referência ao mês e a de apagar é a inversa.
- Arquivos da versão 1 (spec 092) continuam aceitos: a tabela ausente vale como
  vazia, então eles entram sem conversão e a restauração apaga as horas do
  usuário (a restauração sempre substitui a área inteira).
- Conferência estrita das linhas: campo desconhecido (inclusive `userId`), tipo
  fora da lista, horas fora de 0 a 744, valor negativo, mês inexistente e dois
  registros do mesmo tipo no mesmo mês recusam o arquivo antes de gravar.
- O diálogo de importar mostra a linha "Horas" na tabela de contagens (hoje →
  arquivo), por vir de `INCOME_BACKUP_TABLES`. Fora isso, nada na interface mudou.
- Histórico em [docs/backup-format.md](../../docs/backup-format.md).

## Análise dos holerites de 2026

Valores lidos dos PDFs e conferidos: cada total de vencimentos é a soma das
linhas, e o do banco (`income_payslips.gross_salary`) já era igual em todos os
meses. A soma das horas e dos extras abaixo fecha, centavo a centavo, o total
de vencimentos de cada mês.

| Holerite | Pago em | Vencimentos | Descontos | Líquido |
|---|---|---:|---:|---:|
| jan/26 | n/d | 10.500,00 | 2.730,12 | 7.769,88 |
| fev/26 | n/d | 11.095,70 | 2.849,31 | 8.246,39 |
| mar/26 | n/d | 11.792,56 | 3.050,57 | 8.741,99 |
| abr/26 | n/d | 10.780,35 | 2.772,22 | 8.008,13 |
| mai/26 | n/d | 11.599,12 | 2.997,38 | 8.601,74 |
| jun/26, 1ª parcela do 13º | 30/06 | 5.542,85 | 0,00 | 5.542,85 |
| jun/26 | 01/07 | 15.793,22 | 4.150,76 | 11.642,46 |
| jul/26 | 03/08 | 12.295,54 | 3.188,89 | 9.106,65 |
| ago/26 | 01/09 | 13.884,27 | 3.625,80 | 10.258,47 |
| férias de set/26 | 03/09 | 1.989,39 | 154,72 | 1.834,67 |
| set/26 | 01/10 | 15.443,55 | 5.384,73 | 10.058,82 |

Horas pagas (`paidHours` / `paidAmount`), as 18 linhas do arquivo:

| Mês | Normais | Extras 50% | Extras 75% | Extras 100% | DSR (fora do modelo) |
|---|---|---|---|---|---:|
| jan | 200 / 10.500,00 | | | | |
| fev | 200 / 10.780,35 | | | | |
| mar | 200 / 10.780,35 | | 9 / 848,95 | | 163,26 |
| abr | 200 / 10.780,35 | | | | |
| mai | 200 / 10.780,35 | | 7 / 660,30 | | 158,47 |
| jun | 200 / 10.780,35 | 49 / 3.961,78 | | 2 / 215,61 | 835,48 |
| jul | 200 / 11.104,00 | 12 / 999,36 | | | 192,18 |
| ago | 200 / 11.104,00 | 8 / 666,24 | | 15 / 1.665,60 | 448,43 |
| set | 173,33 / 9.623,28 | | 18 / 1.748,88 | 13 / 1.443,52 | 638,48 |

Observações da leitura (fatos, sem decisão):

- **Valor da hora:** salário ÷ 200 (R$ 53,90 até junho; R$ 55,52 desde julho,
  quando o salário passou de R$ 10.780,35 para R$ 11.104,00), com o adicional
  de 50%, 75% ou 100% por cima. O DSR das extras é uma linha à parte.
- **Mar, abr e mai:** o holerite (layout antigo) traz "30 Dias" no lugar de
  horas; as normais ficam em 200 h (jan e fev trazem 200:00 hs, e de junho em
  diante o layout novo traz 200). Sem nota: as horas normais são as que não
  são extras e pesam pouco no cálculo.
- **Fev:** a "Diferença de Salário" (R$ 280,35, ev. 17) é o retroativo de
  janeiro, e o "Reembolso de Desconto Indevido" (R$ 35,00, ev. 104) devolve a
  taxa assistencial de janeiro. Ficam fora das horas; a linha de horas normais
  de fevereiro leva só os R$ 10.780,35.
- **Set:** as horas normais são 173,33 porque os 4 dias de férias saem delas
  (26 dias × 200 ÷ 30). O holerite de setembro (R$ 15.443,55) já contém as
  férias (R$ 1.989,39) e desconta o líquido delas (R$ 1.834,67, pago em 03/09).
  Para não contar duas vezes (decisão do usuário, ponto aberto da
  [spec 088](088-income-ledger.md)), o arquivo divide o mês: **Salário
  R$ 13.454,16** (base 173,33 h + DSR + extras de 75% e 100%) e **Férias
  R$ 1.989,39** (08/09 a 13/09), que somam o total do holerite. A renda
  tributável de 2026 da Previdência cai R$ 1.989,39 em relação à planilha da
  spec 092 (o limite de 12% cai R$ 238,73).
- **Líquido × planilha** (`netIncome`, "líquido + extras"): iguais em jan, fev,
  abr, mai e ago; **jul foi corrigido para R$ 9.106,65** (a planilha tinha
  R$ 9.106,55, e as entradas de 2026 passam de R$ 91.157,85 para R$ 91.157,95);
  mar tem R$ 467,00 a mais que o holerite; jun, R$ 20.497,70 (holerite mais o
  adiantamento do 13º dá R$ 17.185,31); set não está lançado. Mar e jun ficam
  como estão: a planilha pode ter extras que o holerite não mostra.
- Declaradas e trabalhadas ficam `null` em todas as linhas: os PDFs só trazem o
  que foi pago. O usuário preenche depois, no arquivo ou, quando houver tela,
  nela.

## Arquivo de carga

`backups/recebimentos/recebimentos-holerites-2026-10-08.backup.json` (fora do
Git), versão 2, ids estáveis (UUID v5 das linhas novas): parte do estado local
exportado em 2026-10-08 (`estado-local-antes-das-horas-2026-10-08.json`, igual
ao export das 02:53 UTC) e acrescenta:

- 1 holerite: 13º salário de 01/06 a 30/06, R$ 5.542,85, não proporcional (fora
  da renda tributável da Previdência; o Salário bruto de junho em Recebimentos
  passa de R$ 15.793,22 para R$ 21.336,07);
- 18 linhas de horas (tabela acima);
- as correções acima: líquido de julho em R$ 9.106,65 e setembro dividido em
  salário e férias.

Totais: 21 meses, 25 holerites, 18 linhas de horas. Em 2026, as entradas passam
a R$ 91.157,95 e o poupado a R$ 56.204,86 (julho, +R$ 0,10); as saídas não mudam.
O bruto de setembro é R$ 15.443,55, igual ao holerite.

## Como importar

A restauração substitui os recebimentos do usuário inteiros, então o arquivo é
completo (não se importa o da spec 092 antes dele).

1. Local: `pnpm db:migrate`, `pnpm db:generate` e reiniciar o `pnpm dev`; depois
   Recebimentos → Backup → Importar backup, ou
   `pnpm income:backup restore --user nandohneto@gmail.com <arquivo>` (simula) e
   `--apply`.
2. Produção: depois do deploy com a migração, Recebimentos → Backup → Importar
   backup com o mesmo arquivo. Deploy não restaura backup
   ([Produção](../context/production.md)).

## Fora de escopo

Tela, formulário ou rota de horas; comparação declarado × pago × trabalhado;
controle diário; DSR, férias, descontos e demais eventos do holerite;
anexar o PDF ao mês.

## Verificação

- `tests/integration/income.test.ts` (schema `recebimentos_teste`, 11 testes):
  uma linha por tipo; limites do banco (negativo, mais de 744 h, valor
  negativo, mês de outro usuário); salvar o mês mantém as horas; excluir leva as
  horas e o desfazer as devolve iguais; ida e volta exata do backup v2;
  conferência estrita; versão 1 aceita e versão 3 recusada; isolamento por
  usuário na exportação; carga do arquivo (21 meses, 25 holerites, 18 linhas,
  totais de 2026 com o ajuste de julho, renda tributável R$ 1.989,39 menor,
  líquido de julho, bruto de setembro igual ao do holerite e soma de agosto
  fechando o total de vencimentos).
- `prisma migrate diff` do schema contra as migrações: sem diferença.
- `tsc --noEmit`, `eslint` e os 89 testes de `tests/unit`: sem erros.
