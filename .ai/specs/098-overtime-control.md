# 098 — Controle de horas extras em Recebimentos

Estado: implementada e conferida localmente em 2026-10-08 e revista em
2026-10-09; publicada em produção pelo PR #1 (commit `539d02b`, merge
`5f4697c`, deploy `dpl_85ik8getJEMv6J3GVFr2GDfmzDcX`). As três migrações
foram aplicadas com sucesso e o app e o banco responderam como online.
Os dados reais de 2026 estão no banco local; este deploy não os importou
na produção. A carga segue a seção "Como levar à produção".
Origem: pedido do usuário em 2026-10-08, com as folhas de horas de 2026 e a
planilha de controle. A análise das planilhas, com os números, os erros e as
respostas do usuário, está em [Análise das folhas de horas](../context/overtime-analysis.md).

## Objetivo

Saber quanto o usuário trabalhou a mais, quanto deveria receber, quanto recebeu
e quanto a empresa ainda deve, respeitando que a folha de um mês é paga no
holerite do mês seguinte, e provar as diferenças (dia a dia, holerite a
holerite). A prioridade é identificar e acompanhar divergências, não só
registrar horas.

## Fluxo: um formulário único por mês (pedido do usuário, terceira rodada)

Um só componente faz tudo, no mesmo padrão da inclusão de posição em
Investimentos (`FlowSteps` ao criar, abas ao editar):

- **Declarar horas** (botão do topo): três etapas em sequência.
  1. **Declaração** (obrigatória): mês, período da folha, horas a mais por faixa
     e observação.
  2. **Anexo** (opcional): a folha .xlsx que o usuário envia à empresa. Lida, ela
     passa a ser a declaração (horas e dias saem dela); se não tiver o mês, o
     formulário avisa.
  3. **Pagamento** (opcional): o holerite que pagou e as horas deste mês em cada
     adicional (50%, 75%, 100%), com valor e DSR calculados automaticamente e
     observação. Só é gravado se houver horas preenchidas.
- **Clicar numa linha da tabela** abre o mesmo formulário com as três partes em
  abas (Declaração, Anexo, Pagamento) e um Salvar que vale para todas. No Anexo
  ficam a folha de origem, a troca da folha e os dias (com o tipo trocável); no
  Pagamento, os pagamentos registrados já preenchidos (corrigir e excluir) e
  outro holerite quando necessário. A Declaração fica editável mesmo com folha
  importada; os dias são preservados e há opção de voltar às horas da folha.

Saíram, a pedido do usuário: o botão de pagamento em cada linha, o quadro
"Holerites" e, da segunda rodada, as horas no formulário de Recebimentos e o
"Para conferir". A tabela completa fica no computador. No celular (abaixo de `sm`), aparecem
só Mês, Declaradas, Pagas e Em aberto, com a situação abaixo do mês e sem
rolagem lateral. Período, faixas, holerite, valores e atraso ficam no formulário
que abre ao tocar no mês.

## Decisões

1. **Duas competências, duas fontes.** Mês de trabalho em `overtime_months`
   (com os dias em `overtime_days` quando importado); pagamentos em
   `overtime_payments`, um por holerite que pagou o mês. A conciliação é
   derivada (`reconcileOvertime`, `domain/overtime.ts`) e nunca guardada.
2. **Atribuição explícita.** Cada pagamento já diz de qual mês de trabalho são
   as horas; não há mais distribuição automática dos holerites entre meses. O
   momento é derivado: no holerite esperado (mês seguinte) é "no prazo", depois
   é "com atraso", antes é "adiantado".
3. **Situações:** Sem extras, Pago, Pago com atraso, Pago em parte, Não pago e A
   vencer. Até o prazo do holerite esperado (5º dia útil do mês seguinte a ele,
   art. 459, § 1º) o mês está "A vencer", nunca "não pago". Pago a mais aparece
   no diálogo do pagamento.
4. **Horas a mais por dia, sem descontar faltas** (resposta do usuário: não
   descontar). Em dia útil, o que passa da jornada de 8 h, dividido em até 2 h
   por dia e além; fim de semana e feriado, todas as horas.
5. **Regra única desde jan/26** (resposta do usuário): adicionais da CLT (50%
   em dia útil e sábado, 100% em domingo e feriado) e os limites que a empresa
   explicou (2 h extras por dia útil, 4 h na exceção, fim de semana e feriado com
   acordo prévio), valendo para o período todo, porque a empresa disse que vai
   pagar as horas feitas antes de explicar as regras. O diálogo de Regras fica
   para versões futuras; os limites só registram a regra da empresa e não mudam
   horas nem valores.
6. **Feriado:** os nacionais da lei e a Sexta-feira Santa entram sozinhos;
   regionais o usuário marca no dia. 09/07/2026 foi feriado no local de trabalho
   (resposta do usuário) e está marcado.
7. **Valor da hora e do pagamento (quarta rodada):** a linha normal transcrita
   do holerite (valor ÷ horas, sem arredondar a base); senão, as linhas extras
   transcritas, ponderadas pelos adicionais. Sem transcrição, o bruto do
   Salário de Recebimentos estima a base, descontando as extras atribuídas e
   seu DSR do divisor; outras verbas ou pagamentos incompletos podem afetar a
   estimativa. Mês proporcional/férias não estima pelo bruto, mas pode usar a
   própria transcrição. Sem base no mês, usa a anterior conhecida, ou a primeira
   se o mês antecede todas. O formulário identifica o mês de origem e marca a
   base estimada. Valores e DSR são derivados, o DSR pelo calendário do holerite.
8. **Transcrição dos holerites (spec 094):** `income_hour_records` dá a base do
   valor da hora, sem tela própria. As horas pagas vêm de `overtime_payments`
   e aparecem preenchidas no formulário, com os adicionais já registrados.
9. **Tabela adaptada ao celular** (ajuste do usuário em 2026-10-09): Mês,
   Declaradas, Pagas e Em aberto, com situação junto do mês, sem rolagem
   horizontal. O computador mantém todas as colunas; detalhes ficam também
   nas abas do formulário. Sem blocos por mês ou quadro "Holerites".
11. **Salvar o formulário único:** se há folha anexada nova, a rota de
    importação grava o mês primeiro; depois a ação `saveOvertimeEntryAction`
    (serviço `saveOvertimeEntry`) grava as horas digitadas (ou mantém as da
    folha), os ajustes e o pagamento, achando o mês pelo id ou pela competência.
10. **Navegação:** abas no topo de Recebimentos ("Recebimentos" e "Horas
    extras", `/recebimentos/horas-extras`), só pelo toque (spec 077).

## Modelo

Migrações `20261008231327_income_overtime`, `20261009010000_overtime_payments`
e `20261009150000_overtime_payment_hours` (a terceira remove valores e DSR
armazenados dos pagamentos, agora derivados)
(a segunda cria os pagamentos e tira `income_months.overtime_dsr`, que a
primeira tinha criado e nunca foi publicado). Todas as tabelas com `user_id`,
chaves compostas com o usuário e escopo em `OWNED_MODELS`; tudo passa por
`getIncomeContext` (concessão `INCOME`).

| Tabela | Conteúdo |
|---|---|
| `overtime_months` | competência de trabalho (única por usuário), início e fim da folha, origem (`IMPORT`/`MANUAL`), horas a mais por faixa e falta, horas compensadas com folga, arquivo/aba de origem, avisos da importação e observação. CHECKs: horas de 0 a 744, período de até 45 dias terminando no mês. |
| `overtime_days` | um dia da folha importada: data, horas (0 a 24), tipo (`WORKDAY`, `SATURDAY`, `SUNDAY`, `HOLIDAY`), troca manual e atividade. |
| `overtime_payments` | pagamento de um mês por um holerite (único por mês e holerite): horas a 50%, 75% e 100% e observação. Valores e DSR derivados. CHECKs: horas de 0 a 744, holerite no dia 1. |
| `overtime_rules` | versão da regra a partir de um mês: jornada, adicionais, limites da empresa e desconto da falta. |

Os totais dos meses importados são recalculados a partir dos dias quando um dia
muda de tipo, a folha é reimportada ou as regras mudam. Excluir um mês leva os
dias e os pagamentos; o Desfazer devolve tudo. Excluir um pagamento também tem
Desfazer.

## Importação das folhas

Rota `POST /api/recebimentos/horas-extras/importar` (JSON com os arquivos em
base64, mesma origem, concessão `INCOME`), em dois passos (`check` e `apply`),
até 12 arquivos e 3 MB. Leitura com `exceljs` no servidor (leitor em fluxo, que
ignora o logotipo da folha de setembro, com o leitor comum como reserva).
`domain/overtime-sheet.ts` acha o cabeçalho, lê os dias até "Total", soma as
colunas "Hours", corrige o ano pelo dia da semana escrito (o ano escrito fica
quando já bate), avisa dia da semana divergente, saltos e nome de outro mês;
aba sem folha é ignorada; hora calculada sem valor salvo ou dia repetido recusa
a aba. Reimportar mantém horas compensadas, observação e tipos trocados à mão.
Terminal: `pnpm income:overtime import --user <e-mail> <arquivos.xlsx> [--apply]`.

## Tela (aba Horas extras)

Componentes do núcleo (`KpiCard`, `Badge`, `filterBadge`, `headerButton`,
`premium-panel`, `TONES`, `FlowSteps`/`FlowHeading` de Investimentos), na
linguagem de Recebimentos (menta para pago, violeta para vencido, neutro para a
vencer; sem amarelo).

- Topo: "Recebimentos / Horas extras", com **Regras** e **Declarar horas**.
- Cards: **Declaradas** (com o valor pelas regras), **Pagas** (recebido + DSR),
  **Vencidas** (valor estimado não pago e em quantos meses) e **A vencer**
  (holerite previsto).
- Gráfico **Declaradas × Pagas**: por mês, pago no prazo, pago com atraso,
  vencido e a vencer; alterna Horas e Valores.
- Tabela **Mês a mês**: faixas declaradas, total, holerite esperado, pagas (e
  quanto com atraso), recebido, em aberto e situação. A linha abre o formulário
  único do mês.
- Formulário único (`overtime-entry-dialog.tsx` e `overtime-entry-parts.tsx`):
  as etapas ou abas descritas em "Fluxo".

## Números de 2026 (banco local)

199 h declaradas, 133 h pagas (R$ 12.210,24 + R$ 2.436,30 de DSR), **52 h
vencidas** (março 28 h, abril 16 h e as 8 h do feriado de 09/07 em julho; ≈
R$ 4.596,85 pela CLT, sem DSR) e 14 h de setembro a vencer no holerite de
outubro (≈ R$ 1.165,92). As 6 h a mais do holerite de julho estão registradas em
março, com atraso.

## Backup de Recebimentos, versão 4

Tabelas novas `overtimeRules`, `overtimeMonths`, `overtimeDays` e
`overtimePayments`; `incomeHourRecords` sem as horas declaradas e trabalhadas.
Versões 1 a 3 continuam aceitas (horas extras vazias; as colunas antigas da
linha do holerite saem se vazias, com valor o arquivo é recusado). Detalhes em
[docs/backup-format.md](../../docs/backup-format.md).

## Como levar à produção

1. Commit e deploy concluídos em 2026-10-09, com autorização do usuário. O build aplicou as três
   migrações; a primeira para se houver horas declaradas ou trabalhadas nas
   linhas do holerite (eram 0 de 25 em 2026-10-08).
2. Carregar 2026: pelo app, Declarar horas → Anexo com a folha de cada mês (um
   mês por vez; o `00-ControleHorasExtras.xlsx` serve para todos, porque o
   formulário escolhe a aba do mês declarado), ou, com a autorização do usuário,
   `pnpm income:overtime import` contra a produção com os nove arquivos de uma vez.
3. Regras: uma versão desde jan/26 com os adicionais da CLT e os limites de 2 h e
   4 h.
4. Em julho, aba Anexo, marcar 09/07 como Feriado.
5. Registrar as horas pagas na aba Pagamento; os valores e DSR são calculados:
   fev ← mar/26 9 h a 75%; mar ← jul/26 6 h a 50% (com atraso); abr ← mai/26
   7 h a 75%; mai ← jun/26 49 h a 50% e 2 h a 100%; jun ← jul/26 6 h a 50%;
   jul ← ago/26 8 h a 50% e 15 h a 100%; ago ← set/26 18 h a 75% e 13 h a 100%.

## Fora de escopo

Anexar o PDF do holerite ou a folha e a leitura automática do holerite
([backlog](../context/backlog.md)); avisos de limite.

## Verificação até a terceira rodada

- `tests/unit/overtime.test.ts` (15 testes): faixas por dia, calendário,
  compensação e falta, versões da regra, entrada de horas, prazo e momento do
  pagamento, a conciliação de 2026 com os pagamentos reais (inclusive o feriado
  de julho e a regularização de março), situações pelo prazo, pago a mais, valor
  da hora sem transcrição, sugestão do pagamento e a leitura das folhas.
- `tests/integration/overtime.test.ts` (schema `recebimentos_teste`, 7 testes):
  concessão, prévia e gravação com .xlsx gerados, ajustes e reimportação,
  pagamentos (um por holerite, edição, recusas, escopo, excluir e desfazer, mês
  excluído levando os pagamentos), regras e recálculo, mês digitado, backup v4.
- `tests/integration/income.test.ts` (12), os 108 testes unitários, `tsc`,
  `eslint` e o build de produção (pasta `.next-build`, apagada) passam.
- `tests/e2e/overtime.spec.ts` no servidor `recebimentos-teste` (Chrome, Android
  e iPhone, 16 aprovados): abas de Recebimentos, cards contra a tabela, sem botão
  de pagamento nem "Holerites", a linha abre o formulário com as três abas,
  declarar em etapas com a folha anexada (sem gravar) e largura sem rolagem.
- No navegador: celular (375 px) com a coluna do mês presa e estreita, sem
  rolagem da página; março aberto nas três abas; declarar outubro em etapas com
  12 h e um pagamento de 5 h (A vencer, 7 h em aberto) e excluir o mês.

### Verificação da quarta rodada (2026-10-09)

- 19 testes unitários de horas extras aprovados, incluindo base transcrita
  estável ao editar horas, férias, centavos e feriado no sábado.
- 7 testes de integração no schema `recebimentos_teste`: edição da declaração
  preserva pagamentos; falhas revertem a edição; reimportação preserva feriados
  manuais também na prévia; criação após anexo; backup legado com aviso.
- Chrome e iPhone/WebKit: 13 cenários aprovados (inclui login), 2 cenários sem
  concessão pulados porque o usuário desse schema tem a área. Declaração
  editável, pagamentos preenchidos, recálculo e largura do diálogo conferidos.
- `pnpm check` aprovado. Cliente Prisma regenerado e servidor local reiniciado
  via `next.config.ts` para não consultar colunas removidas pela migração.
- Valores de arquivos v4 antigos passam a ser recalculados; a confirmação do
  backup informa isso e orienta preservar o arquivo original. Produção sem alteração.

### Ajuste da tabela no celular (2026-10-09)

Pedido: reduzir às colunas principais porque a rolagem lateral atrapalha.
Critérios: quatro colunas no celular, situação visível, total e abertura do
formulário preservados, sem rolagem lateral de 320 a 430 px; tabela completa
no computador. Verificação com Playwright em Chrome e WebKit, sem gravar dados.
A conferência de toque em aparelho físico fica para o usuário.

Validação antes da publicação: build de produção, 112 testes unitários e
19 testes de integração de Recebimentos/horas extras aprovados.
