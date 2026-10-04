# Descoberta: transações e próximos ajustes

**Decisões finais e continuidade: [prompt consolidado](position-transactions-prompt.md).**
As últimas respostas confirmaram saldo inicial preservando o legado,
liquidação com transferência nesta etapa e nenhuma correção em cascata.
Este arquivo mantém a investigação e a pesquisa; suas perguntas/rascunho
anteriores foram substituídos pelo prompt consolidado.

Registrado em: 2026-10-04.
Atualizado em: 2026-10-04, após respostas à primeira e à segunda rodada.
Origem: pedido do usuário para investigar o código, fazer perguntas e escrever
um prompt que expresse sua intenção.
Estado: descoberta; o prompt abaixo é um rascunho, não uma spec aprovada.
Nenhuma implementação do aplicativo foi iniciada nesta investigação.
O usuário pediu agora montar o plano e fazer as perguntas restantes. O
[plano proposto](position-transactions-plan.md) acompanha as fatias e seus
critérios de aceite; não autoriza iniciar implementação.

## Intenção expressa

O jeito atual de atualizar a carteira já atende bastante. A evolução deve
acrescentar controle sobre aportes, retiradas e rendimentos sem tornar essa
rotina burocrática. A edição prática da posição deve continuar existindo.

Pedidos explícitos desta rodada:

- transações dentro de uma posição, com um botão ao lado do lápis e uma
  interface única para as operações;
- formas versáteis de informar quantidade, preço e valor, inclusive informar
  valores finais e deixar o aplicativo calcular a diferença;
- liquidação de títulos com escolha de uma posição de caixa de destino;
  caixas em reais e em dólar podem receber uma marcação de conta corrente;
  renomear o tipo apresentado como "Saldo em dólar" para "Caixa em dólar";
- pesquisar uma fonte gratuita e confiável para precificar Tesouro Direto
  por quantidade; atraso na atualização é aceitável;
- cálculo automático bruto de renda fixa indexada, inicialmente sem IR/IOF,
  com data de aplicação, rentabilidade como 105% CDI e vencimento opcional;
- revisão de todas as telas no mobile, tendo iPhone como referência, incluindo
  fontes de campos e o controle descrito como "swipe espremido";
- moeda geral das metas como resultado somente leitura das metas por classe;
- primeira posição e restauração de backup acessíveis na tela inicial vazia;
- em Versões, mostrar somente eventos "Backup importado";
- trabalho exclusivamente local, sem deploy na Vercel.

As dúvidas abaixo distinguem esses pedidos dos detalhes ainda não definidos.

## Respostas confirmadas em 2026-10-04

- **Flexibilidade**: o formulário deve aceitar valor/quantidade da operação
  e valores totais após ela. O usuário quer alternar as variáveis conforme as
  informações que tem em cada mês; o aplicativo calcula a diferença e os
  campos restantes. Na segunda rodada, confirmou explicitamente os dois
  caminhos: montante daquela operação ou novo montante total da posição.
  O formulário deve distinguir esses modos, sem pedir uma escolha exclusiva
  para o produto inteiro. Preço executado e cotação continuam distintos.
- **Lápis da posição**: passa a editar atributos como estratégia e rateio,
  sem alterar quantidade ou saldo. Valores vêm das transações.
- **Correção de valores**: corrigir a transação específica do mês aberto.
  Exemplo dado pelo usuário: aporte registrado como R$ 500 que deveria ser
  R$ 1.000; corrigir esse aporte, sem sobrescrever o saldo da posição.
- **Caixa nas operações comuns**: transferências automáticas entre posições
  ficam adiadas; o usuário movimentará os caixas manualmente nesta etapa.
  Não acrescentar campos obrigatórios de origem/destino a aportes e retiradas.
- **Caixa remunerado**: o usuário citou a possibilidade de acompanhar juros
  em caixa, mencionando Selic, mas não definiu uma modalidade nem aprovou
  presumir remuneração para todo caixa. Permanece possibilidade a detalhar.
- **Rendimento**: um tipo genérico de movimentação, para diferenciar retorno
  de dinheiro novo aportado e melhorar a explicação/cálculo do rendimento.
  Pode incluir dividendos. Não exige subtipos obrigatórios nesta etapa; uma
  lista de motivos poderia existir, mas não foi solicitada como requisito.
  Em renda fixa calculada automaticamente, o lançamento manual tende a ser
  menos usado e não deve duplicar o retorno já calculado.
- **Mobile**: Safari no iPhone 16 Plus. O usuário não identificou qual dos
  três controles é o swipe espremido; a revisão deve conferir os três.
- **Liquidação no vencimento**: há um pedido inicial com caixa de destino,
  mas é preciso esclarecer se o adiamento das transferências também vale
  para esse caso. Nenhuma exceção foi presumida.
- **Escopo desta rodada**: preparar plano e esclarecer perguntas. Continua
  exclusivamente local, sem deploy.

## Comportamento encontrado no código

Leitura inicial do estado de trabalho local, que já continha alterações da spec 053.
Não houve acesso ao banco, execução de mutações ou teste visual nesta análise.

| Assunto | Fato observado | Evidência |
| --- | --- | --- |
| Posições | Fotografias mensais, únicas por competência, conta e ativo; sem entidade de transação financeira | `prisma/schema.prisma`, modelo `Position` |
| Inclusão e edição | Quantidade/saldo final gravado diretamente; edição sobrescreve o anterior | `src/modules/portfolio/application/month-editing.ts`, `addPosition` e `updatePosition` |
| Valores cotados | Quantidade × cotação da competência; cotação mensal não é preço executado de compra | `src/modules/portfolio/ui/position-form-dialog.tsx`; `month-editing.ts` |
| Histórico | Aportes, retiradas e custo médio estimados a partir da diferença mensal; saldos BRL não separam rendimento de aporte | `src/modules/portfolio/domain/position-history.ts` |
| Mês novo | Copia posições anteriores; alterações de meses antigos não recalculam os posteriores hoje | `src/modules/portfolio/application/month-rollover.ts` |
| Vencimento | Informativo, sem liquidação ou destino de caixa | `src/modules/portfolio/presentation/maturity.ts` |
| Tipo do ativo | O tipo escolhido na inclusão não é persistido como atributo explícito; sem símbolo, caixa BRL e renda fixa aparecem como saldo em reais | `prisma/schema.prisma`, `Asset`; `src/modules/portfolio/domain/asset-kinds.ts`, `describeAsset` |
| Metas | Moeda geral agora derivada das metas por classe; plano vigente atualizado no lugar | [spec 054](../specs/054-derived-currency-and-single-target-plan.md), concluída localmente por outra frente |
| Versões | Agora lista somente backups importados | [spec 054](../specs/054-derived-currency-and-single-target-plan.md) |
| Carteira vazia | Agora oferece adicionar posição e restaurar backup, inclusive início da primeira competência | [spec 055](../specs/055-empty-portfolio-start.md), concluída localmente por outra frente |
| Mobile | Há regra de 16px para campos com ponteiro de toque; testes mobile atuais usam Chrome/Pixel 7, sem projeto iPhone/Safari | `src/app/globals.css`; `playwright.config.ts` |

No mobile, existem três candidatos ao relato de swipe: deslizantes de metas,
faixa de competências e gesto de troca de abas. O slider divide uma linha entre
rótulo, trilho e campo de valor sem reorganização específica no mobile.
O gesto de abas escuta o conteúdo todo e precisa ser verificado junto de
tabelas e outras áreas com rolagem horizontal. São pontos para investigação
visual; esta leitura não comprova o defeito relatado nem corrige qualquer tela.

## Pesquisa de fontes oficiais

### Tesouro Direto

Existe [base oficial gratuita com preços e taxas diários](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto),
em CSV, descoberto pela [API pública CKAN](https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto).
Não é uma API de cotação de ticker de bolsa. Tipo do título e vencimento
exato identificam a série. Nesta investigação, o CSV respondeu HTTP 200 e
trouxe preços de 2026-10-02.

Os [metadados oficiais](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/taxa.pdf)
definem PU Base Manhã para marcação a mercado D0. A hipótese técnica é
avaliar quantidade × PU base para patrimônio diário. Preço de mercado,
rendimento contratado até o vencimento e dinheiro efetivamente liquidado
são informações distintas. Ainda é necessário conferir os títulos do usuário,
cobertura histórica e tratamento de títulos com pagamentos periódicos.

O endpoint antigo `treasurybondsinfo.json` respondeu HTTP 410 nesta pesquisa;
não foi escolhido como base da integração.

### CDI e renda fixa

O [SGS do Banco Central, série 12](https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?hdOidSeriesSelecionadas=12&method=consultarGraficoPorId)
publica CDI diário em percentual ao dia. CDI e Selic são distintos. Para
acompanhar uma aplicação a 105% CDI, a proposta técnica é acumular a série
diária observada a partir da data financeira de cada aporte, respeitando as
convenções do contrato e a precisão do cálculo. Não congelar o CDI do dia do
cadastro para reproduzir o rendimento passado.

A [B3 documenta fórmulas de acumulação por dias úteis](https://www.b3.com.br/data/files/2C/84/37/A0/A394F6109A4874F6AC094EA8/Caderno%20de%20Formulas%20-%20CDBs-DIs-DPGE-LAM-LC-LF-LFS-LFSC-LFSN-IECI-RDB.pdf).
Data de cadastro não substitui a data de aplicação. Saldo bruto calculado
até a última taxa publicada deve ser separado de projeção futura, que exige
uma hipótese, por exemplo manter o último CDI disponível.

A conectividade da API BCData não foi confirmada nesta investigação por falha
de DNS. A existência e a unidade da série foram confirmadas no SGS. A
implementação deverá validar acesso, consultas em intervalos e falta de dados.
Isso não constitui integração implementada ou reprodução exata de extrato.

## Perguntas enviadas — primeira rodada

Respondidas pelo usuário em 2026-10-04; as decisões estão na seção de
respostas confirmadas acima. A flexibilidade foi confirmada; os casos de
valor final em ativos cotados são detalhados na segunda rodada.

Exemplo que explica a primeira dúvida: havia 10 ações, foram compradas mais
2 a R$ 25. A compra custou R$ 50. Se a cotação atual é R$ 30, a posição de
12 ações vale R$ 360; dividir esse patrimônio pela quantidade dá a cotação
atual, não o preço executado na compra. O formulário precisa distinguir isso.

## Perguntas enviadas — segunda rodada

Respondidas:

- Rendimento: categoria única e genérica, para distinguir retorno de aporte;
  pode incluir dividendos, sem exigir subcategorias.
- Montante final: manter os dois caminhos disponíveis, distinguindo montante
  da operação e montante total da posição no preenchimento.
- Mobile: Safari no iPhone 16 Plus; conferir os três controles candidatos ao
  relato, sem repetir a pergunta sobre modelo/navegador.

Ainda aguardando resposta:

1. Dados existentes: preservar fotografias mensais e começar as transações
   com saldo de abertura, ou permitir também cadastrar operações antigas
   reais que o usuário conhece?
2. O adiamento de transferências inclui a liquidação de vencimentos, ou esta
   continua com destino de caixa automático?
3. Ao reabrir um mês antigo e corrigir uma transação, os saldos dos meses
   seguintes devem ser recalculados, inclusive os de meses fechados?

O exemplo enviado na segunda rodada mostrou por que os dois modos usam
relações distintas: antes 10 unidades cotadas a R$ 30, total R$ 300; compra
a R$ 25. Alvo final de mercado R$ 360 implica comprar 2 unidades por R$ 50.
Operação de R$ 60 implica comprar 2,4 unidades, com valor final de mercado
R$ 372. A interface calcula conforme o modo informado e mostra a prévia.

## Questões para detalhamento das fatias

- Quando o usuário não sabe explicar uma diferença de saldo, deve existir
  ajuste de saldo explícito, sem presumir aporte ou rendimento?
- Liquidação também pode ser antecipada? O usuário informa/confirma o valor
  efetivamente recebido? Como apresentar posições encerradas no histórico?
- Quais títulos de Tesouro possui e qual valor quer acompanhar: preço de
  mercado como ações ou rendimento acumulado até o vencimento?
- Quais indexadores de renda fixa usa? "LCD" significa LCD mesmo ou LCA?

Moeda geral, Versões e carteira vazia já foram tratados nas specs 054/055.
As antigas dúvidas desses assuntos foram substituídas pelas referências ao
comportamento local concluído, sem reabrir decisões de outra frente.

## Rascunho do prompt

> Quero evoluir meu aplicativo de investimentos preservando a praticidade
> atual. Hoje já consigo atualizar e consultar a carteira de um jeito que me
> atende. O objetivo desta etapa é ganhar um registro confiável de aportes,
> retiradas e rendimentos, com poucos campos e sem tornar a rotina mais lenta.
>
> Primeiro, leia as instruções do projeto, o contexto e o código atual.
> Use esta descoberta e minhas respostas como base. Resolva as dúvidas de
> negócio antes de transformá-las em regras. Divida a execução em specs
> pequenas, com critérios de aceite. Trabalhe somente localmente e não faça
> deploy na Vercel ou publique mudanças em serviços de produção.
>
> **1. Transações dentro das posições.** Permita registrar aportes, retiradas
> e rendimentos em uma posição existente, e o movimento inicial de uma posição
> nova. Coloque uma ação de movimentar ao lado do lápis e use uma interface
> única, adaptada ao ativo e à operação. O lápis da posição edita atributos,
> como estratégia, nome e rateio, e deixa de editar quantidade ou saldo.
> Para corrigir valores, edite a transação específica, se o mês dela estiver
> aberto. A criação da posição deve incluir seu movimento/saldo inicial.
> Guarde data financeira e valores efetivos da operação, separados da cotação
> de mercado. Permita editar movimentos de meses abertos e preserve a regra
> atual de fechamento/reabertura. Mostre o histórico na página da posição e
> diferencie aportes de rendimento nos cálculos e gráficos. Use Rendimento
> como categoria genérica nesta etapa, inclusive para dividendos, sem exigir
> subcategorias e sem movimentar caixa automaticamente.
>
> **2. Preenchimento versátil.** O usuário escolhe os dados que tem em mãos:
> quantidade e preço, valor e quantidade, ou valor e preço. Calcule o campo
> restante e mostre o resultado antes de salvar. Também deve ser prático
> informar a nova quantidade ou saldo total e calcular a diferença para a
> posição anterior. Ofereça os dois modos confirmados: valor da operação e
> novo valor total da posição, com prévia clara de antes, movimento e depois.
> Não trate cotação atual, custo de compra
> e saldo final como o mesmo valor. Cotação disponível pode ajudar a preencher,
> mas o preço efetivamente executado deve poder ser informado pelo usuário.
>
> **3. Caixa e liquidação.** Aportes e retiradas comuns não movimentam outra
> posição automaticamente nesta etapa. O usuário atualiza os caixas
> manualmente; não exija caixa de origem/destino. Renomeie o tipo apresentado como Saldo em dólar
> para Caixa em dólar. Nos tipos Caixa em reais e Caixa em dólar, permita
> marcar quais posições funcionam como conta corrente e podem receber a
> liquidação futura. O escopo da liquidação está pendente da segunda rodada;
> se mantida agora, para títulos vencidos ofereça ação de liquidar, pedindo o caixa
> de destino. A operação deve registrar a saída do título e a entrada no caixa
> de forma atômica, preservar o histórico e não contar a transferência interna
> como aporte externo ou rendimento. Valor recebido, liquidação antecipada,
> e regras de moeda serão fechados na descoberta. Se o adiamento incluir
> liquidação, mantenha essa parte no backlog e não faça transferência automática.
>
> **4. Tesouro e renda fixa.** Valide a cobertura da base oficial do Tesouro
> para os títulos que possuo. Se atender ao requisito de gratuidade e
> confiabilidade, permita selecionar o título e vencimento e precificar pela
> quantidade, mostrando a data do preço. Não é necessário um ticker de bolsa
> se houver identificação inequívoca. Para renda fixa a percentual do CDI,
> use a data efetiva dos aportes e o histórico diário do indexador para estimar
> o saldo bruto acumulado, sem IR/IOF nesta etapa. Separe esse saldo da projeção
> futura, que deve informar sua hipótese de taxa. Determine os indexadores e
> produtos efetivamente usados antes de ampliar o cálculo. Não some rendimento
> automático e lançamento manual do mesmo rendimento duas vezes.
>
> **5. Metas.** Preserve o comportamento da spec 054, já concluída localmente:
> moeda geral calculada a partir das metas por classe, somente leitura, e
> plano vigente atualizado no lugar.
>
> **6. Primeira utilização e Versões.** Preserve as specs 054 e 055: eventos
> de Versões somente de Backup importado, carteira vazia com Adicionar posição
> e Restaurar backup, e criação funcional da primeira competência. Adapte a
> primeira inclusão para registrar o movimento inicial da nova posição.
>
> **7. iPhone e integridade dos dados.** Revise entrada/cadastro, Visão Geral,
> Posições, detalhe, cotações, Configuração e backup, incluindo formulários,
> diálogos, seletores, tabelas e o novo fluxo de transações. Verifique fontes
> de inputs, teclado aberto, alvos de toque, áreas seguras, rolagem e conflitos
> de gestos. Identifique e corrija o swipe relatado; confira deslizantes,
> faixa dos meses e gesto de abas. A referência é Safari no iPhone 16 Plus.
> Use viewport equivalente e Safari/WebKit para verificação local e registre o que depende de teste no
> aparelho real. Preserve os dados e meses existentes, sem inventar transações
> históricas. Qualquer mudança no modelo deve manter isolamento por usuário,
> backup e conversão dos backups antigos conforme docs/backup-format.md.
> Testes com gravação devem usar schema isolado. Respeite as alterações já em
> das specs 053 a 055 e o fluxo de aprovação de commits do projeto. Siga a
> ordem e os critérios do plano proposto, sem implementar itens ainda pendentes.

As regras explicitamente deixadas para descoberta tornam este texto um
rascunho. A execução só deve começar após definir as fatias correspondentes.
