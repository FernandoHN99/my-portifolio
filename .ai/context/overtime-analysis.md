# Análise das folhas de horas e do controle de horas extras (2026)

Registrado em: 2026-10-08. Origem: pedido do usuário para analisar as folhas
antes de implementar o controle de horas extras ([spec 098](../specs/098-overtime-control.md)).
Fontes: os arquivos da pasta do iCloud
`Documents/01-Dinheiro/06-Amaris/01-LancamentoHoras/2026/` (`01-Janeiro.xlsx`
a `09-Setemro.xlsx` e `00-ControleHorasExtras.xlsx`) e os holerites de 2026
já lidos na [spec 094](../specs/094-income-hours-model.md). Os arquivos não
foram alterados; a leitura foi feita sobre cópias.

Fatos observados ficam separados das hipóteses. Nada aqui é regra da empresa
confirmada.

## 1. Estrutura das folhas mensais

- Uma aba, "Versão Dividida" ("Monthly Status Report"), com o nome do usuário,
  o ano (célula C5, sempre 2025, nunca atualizada) e o cabeçalho na linha 7:
  `Date`, `Week Day`, `Worked`, `Activities` e cinco pares `Project N`/`Hours`.
  Só o primeiro par é usado (projeto "Porto Saúde").
- Um dia por linha, do dia seguinte ao corte do mês anterior até o corte do mês
  (o fechamento varia entre os dias 18 e 21). A competência da folha é o mês do
  fim do período:

| Folha | Período |
|---|---|
| Janeiro | 19/12/2025 a 18/01/2026 |
| Fevereiro | 19/01 a 20/02 |
| Março | 21/02 a 21/03 |
| Abril | 22/03 a 20/04 |
| Maio | 21/04 a 21/05 |
| Junho | 22/05 a 19/06 |
| Julho | 20/06 a 21/07 |
| Agosto | 22/07 a 21/08 |
| Setembro | 22/08 a 21/09 |

- `Worked` é `=IF(F<>0;"Yes";"No")`; a linha "Total" soma as horas e conta os
  "Yes". De janeiro a maio há uma fórmula de saldo:
  `total de horas − (dias úteis com "Yes" × 8)`. De junho a setembro ela não
  existe.
- `00-ControleHorasExtras.xlsx` tem a aba "Resumo" (tabela com declaradas,
  pagas e diferença, a 100% e a 50%) e uma cópia de cada folha mensal. Os dias e
  as horas das cópias são idênticos aos dos arquivos mensais (conferido célula a
  célula); só faltam as fórmulas de saldo.

## 2. Erros e inconsistências

1. **Ano das datas.** Em fevereiro, as datas vão de 2025 a 2030 (o Excel
   arrastou o ano: 19/01/2025, 20/01/2026, 21/01/2027…); em março, todas estão
   em 2030. O dia da semana escrito ao lado está certo, e foi ele que permitiu
   reconstruir 2026. A importação do app faz isso e avisa.
2. **Dia da semana errado.** 21/05/2026 está como quarta-feira; é quinta. Vale a
   data.
3. **"Yes" digitado.** 21/03 (sábado) tem `Worked = "Yes"` por cima da fórmula,
   com 0 h. Não muda as horas, mas a contagem de dias trabalhados fica errada.
4. **O saldo da planilha desconta faltas.** Ele é líquido: janeiro dá −8 (24/12
   e 31/12 com 4 h), fevereiro dá 7 (9 h a mais menos as 2 h de 18/02, Quarta
   de Cinzas com 6 h) e abril dá 18 (23 h a mais menos as 5 h de 07/04, dia de 3
   h). A empresa pagou 9 h em fevereiro, não 7: a evidência é de cálculo por dia,
   sem descontar faltas. O app separa as horas a mais da falta.
5. **Dias úteis sem horas não entram no saldo.** A fórmula só conta dias com
   "Yes", então um dia útil sem horas não vira falta: 02/01, 06/04, 25/06,
   26/06 e 08 a 11/09 (férias de 08 a 13/09, spec 094). Os demais podem ser
   folga, ponte ou compensação; não há como saber pelos arquivos.
6. **Setembro foi salvo por outro programa.** As fórmulas não têm o valor
   calculado salvo e o arquivo tem um logotipo que quebra alguns leitores. O app
   lê as horas (que são números digitados) e ignora as fórmulas.
7. **"Resumo" da planilha de controle.**
   - Mistura as faixas: março (34 h) põe o domingo 22/02 (11 h) em "100%";
     julho (23 h) põe o fim de semana (17 h) em "100%"; agosto separa 18 h (dias
     úteis) em "100%" e 13 h (fim de semana) em "50%"; abril usa o saldo líquido
     (18).
   - Compara a folha de um mês com o holerite do mesmo mês, sem a defasagem de
     um mês do pagamento.
   - "Pagas" de março (12) e maio (10) não batem com os holerites (9 h e 7 h, a
     75%). Hipótese não confirmada: valor com DSR ÷ (hora × 1,5) dá 12,5 e 10,1.
   - Setembro está com 0 pagas, mas o holerite de setembro pagou 31 h (das
     folhas de agosto).
   - Os totais da tabela não têm valor calculado salvo.

## 3. Horas a mais por mês de trabalho

Contagem por dia, com jornada de 8 h nos dias úteis; fim de semana e feriado
contam inteiros. "Úteis ≤ 2 h" são as duas primeiras horas a mais de cada dia
útil (o limite do art. 59 da CLT); "Úteis > 2 h", o que passa disso.

| Mês | Úteis ≤ 2 h | Úteis > 2 h | Sáb | Dom | Total | Falta (dias) | Saldo da planilha |
|---|---:|---:|---:|---:|---:|---|---:|
| Jan | 0 | 0 | 0 | 0 | **0** | 8 h (24/12, 31/12) | −8 |
| Fev | 9 | 0 | 0 | 0 | **9** | 2 h (18/02) | 7 |
| Mar | 11 | 12 | 0 | 11 | **34** | — | 34 |
| Abr | 10 | 11 | 2 | 0 | **23** | 5 h (07/04) | 18 |
| Mai | 26 | 25 | 0 | 0 | **51** | — | 51 |
| Jun | 2 | 4 | 0 | 0 | **6** | — | sem fórmula |
| Jul | 5 | 1 | 7 | 10 | **23** | — | sem fórmula |
| Ago | 13 | 5 | 6 | 7 | **31** | — | sem fórmula |
| Set | 14 | 0 | 0 | 0 | **14** | — | sem fórmula |
| **2026** | **90** | **58** | **15** | **28** | **191** | | |

Nenhum feriado nacional teve horas. Dias para conferir:

- **Acima de 4 h a mais num dia útil** (o limite excepcional informado pela
  empresa): 04/03 (+8), 19/03 (+5), 24/03 (+7), 09/04 (+7), 23/04 (+5), 28/04
  (+5), 07/05 (+6), 13/05 (+6), 14/05 (+9), 11/06 (+6).
- **Entre 2 e 4 h a mais** (acima do limite habitual): 03/03, 09/03, 25/03,
  06/05, 18/05, 17/07, 22/07, 30/07, 05/08, 11/08 e 19/08.
- **Fim de semana**: 22/02 (dom, 11 h, acompanhamento de deploy em produção),
  28/03 (sáb, 2 h), 11/07 (sáb, 7 h), 12/07 (dom, 10 h), 15/08 (sáb, 6 h),
  16/08 (dom, 7 h).
- **09/07** (Revolução Constitucionalista, feriado estadual em SP) tem 8 h como
  dia útil. Se for feriado no local de trabalho, as 8 h são todas extras.
- **Setembro** fica dentro de 2 h a mais por dia, como o usuário disse; agosto
  já tem dias de 3 h e dois dias de fim de semana.

## 4. Folhas × holerites, com a defasagem de um mês

A folha de um mês é paga no holerite do mês seguinte, pago no começo do outro
mês (o de setembro saiu em 01/10). Os holerites confirmam: os totais de
fevereiro, maio, julho e agosto batem hora a hora com o holerite seguinte.

| Mês de trabalho | Extras | Holerite esperado | Pago nele | Situação em 08/10/2026 |
|---|---:|---|---|---|
| Fev | 9 | Mar | 9 h a 75% | pago (inteiro, sem descontar a falta) |
| Mar | 34 | Abr | nada | **28 h em aberto** (6 h atribuídas ao excedente de julho) |
| Abr | 23 | Mai | 7 h a 75% | **16 h em aberto** |
| Mai | 51 | Jun | 49 h a 50% + 2 h a 100% | pago |
| Jun | 6 | Jul | 12 h a 50% | pago; sobram 6 h |
| Jul | 23 | Ago | 8 h a 50% + 15 h a 100% | pago |
| Ago | 31 | Set | 18 h a 75% + 13 h a 100% | pago (útil 18 h a 75%, fim de semana 13 h a 100%) |
| Set | 14 | Out | holerite ainda não emitido | a vencer (prazo 09/11) |

- Vencidas: 177 h (fevereiro a agosto); pagas: 133 h; **em aberto: 44 h**.
  Se as 6 h a mais de julho não forem regularização de março, o total em aberto
  continua 44 h (março fica com 34 h e julho com 6 h pagas sem mês).
- **Depois das respostas do usuário (seção 7):** 09/07 foi feriado, então julho
  tem 31 h (8 h de feriado a 100%) e só 23 h foram pagas. O total em aberto
  passa a **52 h**: março 28 h, abril 16 h e julho 8 h (≈ R$ 4.596,85 pela CLT,
  sem o DSR).
- Valor estimado das 44 h, sem o DSR: R$ 3.801,66 pelo piso da CLT (50% em dia
  útil e sábado, 100% no domingo) ou R$ 4.527,55 pela hipótese de convenção
  abaixo (75% e 100%). O DSR pago sobre as extras foi de 19% a 24% do valor das
  extras em cada holerite.
- O valor de cada linha do holerite bate com horas × salário ÷ 200 × (1 + %):
  não há erro de conta, só de quantidade e de percentual.

## 5. Percentuais observados e regras

- **Observado nos holerites:** dias úteis pagos a 75% em março, maio e setembro
  e a 50% em junho, julho e agosto; 100% em junho (2 h de origem incerta),
  agosto (15 h, perto das 17 h do fim de semana de julho) e setembro (13 h, o
  fim de semana de agosto exato). A empresa não seguiu um percentual fixo.
- **Interpretação do usuário** (extras excepcionais em dia útil a 100%, fim de
  semana a 50% ou 75%): setembro mostra o contrário (dia útil a 75%, fim de
  semana a 100%). Não confirmada.
- **Lei (CLT), sem convenção:** adicional de no mínimo 50% (art. 7º, XVI, da
  Constituição; art. 59, § 1º); prorrogação de até 2 h por dia (art. 59);
  domingo e feriado trabalhados sem folga compensatória em dobro (Lei 605/49 e
  Súmula 146 do TST); sábado depende de ser dia útil ou de descanso. É o padrão
  do app enquanto nada for confirmado.
- **Convenção coletiva:** a categoria provável é a do Sindpd-SP (TI no estado de
  São Paulo, convenção com o Seprosp). Um resumo não oficial na internet
  atribui à convenção 75% nas duas primeiras horas extras do dia útil e 100% nas
  demais, nos domingos e nos feriados. O texto registrado não foi conferido. Se
  for isso, os pagamentos a 50% (junho a agosto) ficaram abaixo do devido. O
  usuário pode cadastrar essa regra no app e comparar. Ele escolheu ficar com os
  adicionais da CLT (seção 7).
- **Regras da empresa** (informadas ao usuário em 2026): até 2 h extras por dia
  útil, 4 h na exceção, fim de semana e feriado só com acordo prévio. São regras
  internas, não de remuneração. O app só as registra na regra, sem avisos nem
  descarte de horas (os avisos saíram a pedido do usuário).

## 6. Pontos em aberto

Os pontos 2, 3, 5 e o desconto da falta foram respondidos em 2026-10-08 (seção 7).
Continuam para o usuário confirmar com a empresa ou nos documentos: 1, 4 (o
usuário decidiu usar a CLT enquanto isso), 6 e 7.

1. Por que o holerite de abril não pagou as 34 h de março, e o de maio só 7 das
   23 h de abril.
2. Se as 12 h do holerite de julho (6 a mais que as de junho) regularizaram
   março.
3. Se houve banco de horas ou folga compensatória: 06/04, 25/06 e 26/06 (dias
   úteis sem horas) podem ter compensado extras de março e abril. Se sim, o app
   tem o campo "Compensadas com folga" no mês.
4. Qual convenção vale e quais percentuais ela fixa; se o sábado é dia útil ou
   descanso.
5. Se 09/07 era feriado no local de trabalho.
6. Se meio período em 24/12, 31/12 e na Quarta de Cinzas era dispensa da
   empresa (então não é falta).
7. As 2 h a 100% do holerite de junho: de qual dia vieram.

## 7. Respostas do usuário (2026-10-08)

1. Adicionais: os da CLT (50% em dia útil e sábado, 100% em domingo e feriado).
2. Faltas: não descontar das horas extras.
3. 06/04, 25/06 e 26/06: não foram folgas para compensar horas extras.
4. 09/07: foi feriado no local de trabalho (marcado no app).
5. As 6 h a mais do holerite de julho regularizaram março.
6. Regras da empresa: a mesma regra vale para o ano todo (2 h extras por dia
   útil, 4 h na exceção, fim de semana e feriado com acordo prévio). A empresa
   explicou as regras depois, ele não as cumpriu antes e a empresa disse que vai
   pagar as horas feitas.
7. Deploy: ainda não.
