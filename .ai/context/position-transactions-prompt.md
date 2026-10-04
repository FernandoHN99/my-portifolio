# Prompt de continuidade: transações, renda fixa, Tesouro e iPhone

Atualização posterior de 2026-10-04: o usuário pediu a revisão implementada
localmente nas [specs 063 a 066](../specs/README.md). Elas prevalecem sobre este
briefing nos seguintes pontos: cálculo bruto automático de renda fixa pausado;
Selic somente informativa; cadastro com saldo inicial automático; inclusão e
movimentação por etapas obrigatórias; comprovante de ticker entre processos;
cotação atual na inclusão e histórico no job; atualização manual só em dev.
Esta rodada permanece local, sem deploy. As demais regras mensais continuam.

Consolidado em 2026-10-04 a partir das respostas do usuário.
Fonte principal das regras confirmadas para esta evolução.
Preparado em um atendimento dedicado somente à documentação; não representa
implementação concluída nem aprovação de commit ou deploy.

## Objetivo

Quero evoluir meu aplicativo pessoal de investimentos preservando sua
praticidade. O jeito atual já me atende bastante. Quero ganhar controle sobre
aportes, retiradas e rendimentos, podendo atualizar a carteira com os números
que tenho disponíveis em cada ocasião.

Quero transações dentro das posições, um formulário flexível, correção de uma
operação específica e um histórico que explique a evolução dos valores.
Também quero liquidação de títulos vencidos, cálculo bruto de renda fixa,
cotação de Tesouro quando a fonte for confiável e gratuita, e revisão completa
do aplicativo no Safari do iPhone 16 Plus.

Use este documento como briefing. Antes de implementar, confronte os
requisitos com o estado atual do código e organize a execução em specs
pequenas, com critérios de aceite. As regras confirmadas abaixo prevalecem
sobre sugestões antigas da descoberta e sobre comportamentos parciais que
ainda não atendem a elas.

## Contexto para começar

Repositório: `/Users/fernandohneto/Dev/my-portifolio`.

Leia `AGENTS.md`, `.ai/README.md`, `.ai/context/initial-context.md`, o estado
em `.ai/specs/README.md` e os documentos relevantes. Verifique instruções
locais antes de trabalhar em cada área. Para código Next.js, leia os guias
aplicáveis em `node_modules/next/dist/docs/`.

Referências desta descoberta:

- [Investigação e pesquisa de fontes](next-adjustments-discovery.md).
- [Mapa das fatias](position-transactions-plan.md).
- [Propósito e regras existentes](ux-restructure.md).
- [Formato e evolução do backup](../../docs/backup-format.md).
- [Fluxo de Git](../../docs/git-workflow.md).

A árvore local contém trabalho de outras frentes. Na última leitura, já
existiam arquivos parciais de transações em `src/modules/portfolio/domain/`,
`application/` e `ui/`, além de uma migração e alterações no backup. Não
recomece automaticamente nem considere esses arquivos uma entrega concluída.
Verifique o que existe, preserve as mudanças úteis e adapte o que divergir
deste briefing. Os fatos dessa leitura estão no documento de investigação.

Também preserve os ajustes já documentados localmente:

- [053 — Job de cotações](../specs/053-scheduled-quote-sync.md): integrações
  automáticas seguem a arquitetura de sincronização fora da navegação;
- [054 — Metas e Versões](../specs/054-derived-currency-and-single-target-plan.md):
  moeda geral calculada pelas metas por classe, somente leitura; plano
  vigente atualizado no lugar; Versões mostra somente Backup importado;
- [055 — Carteira vazia](../specs/055-empty-portfolio-start.md): primeira
  posição e restauração de backup acessíveis, com primeira competência funcional.

## 1. Posição e transações têm edições diferentes

O lápis da posição edita seus atributos: nome, estratégia, rateio,
vencimento, liquidez e os demais dados de cadastro aplicáveis. Deixa de
alterar diretamente quantidade ou saldo.

Os valores financeiros passam a ser registrados por transações:

- **Aporte:** dinheiro novo aplicado naquela posição.
- **Retirada:** dinheiro ou quantidade removidos daquela posição.
- **Rendimento:** retorno da aplicação, separado de aporte. É uma categoria
  genérica nesta etapa e pode incluir dividendos. Não exige subcategorias.

Uma correção de valor deve editar a transação específica. Se registrei aporte
de R$ 500 e o correto era R$ 1.000, altero aquele aporte. Não sobrescrevo o
saldo da posição e não crio outro aporte de R$ 1.000 por cima do anterior.

Só transações da competência aberta podem ser incluídas, editadas ou
removidas. Preserve a regra existente de fechamento e reabertura de mês.
Os atributos compartilhados do ativo continuam seguindo seu escopo atual;
a regra sem cascata abaixo se refere aos valores financeiros mensais.

## 2. Formulário único e preenchimento flexível

Coloque uma ação de movimentar ao lado do lápis na tabela e ofereça o mesmo
fluxo na página da posição. A criação de uma posição nova inclui seus
atributos e seu movimento inicial de forma contínua.

O usuário precisa poder alternar entre:

- **Valor desta operação:** quanto aportou ou retirou.
- **Novo total da posição:** quanto ou quantas unidades deseja registrar
  após a operação; o aplicativo calcula a diferença.

Os dois modos devem existir. Não escolha um deles para todo o produto nem
obrigue o usuário a conhecer sempre a mesma combinação de dados.

| Informações disponíveis | O aplicativo calcula |
| --- | --- |
| Quantidade da operação + preço unitário executado | Valor pago ou recebido |
| Valor da operação + preço unitário executado | Quantidade movimentada |
| Valor da operação + quantidade movimentada | Preço unitário executado |
| Nova quantidade total + preço executado | Diferença de quantidade e valor da operação |
| Novo saldo total de uma posição manual | Aporte ou retirada pela diferença do saldo |
| Novo valor de mercado total + cotação de referência | Quantidade final e sua diferença; preço executado determina valor pago/recebido |

Quantidade, preço e valor devem aceitar preenchimento prático em pt-BR,
considerando a moeda e a precisão do ativo. Mostre quais campos foram
informados e quais foram calculados. Se faltar um dado necessário, peça
somente esse dado. Se dados entrarem em conflito, mostre a divergência antes
de salvar, sem substituir silenciosamente um número digitado.

Separe **preço executado**, **cotação de mercado** e **saldo/valor final**.
Cotação disponível pode ajudar a preencher, mas não substitui um preço real
de compra ou venda que eu informar.

Prévia esperada: **Antes → Movimentação → Depois**, com quantidade, dinheiro
movimentado e valor de mercado quando aplicáveis.

Exemplo: tenho 10 unidades cotadas a R$ 30. Compro 2 por R$ 25 cada.
A operação é de R$ 50, termino com 12 unidades e o valor de mercado é R$ 360.
Se informo alvo de valor de mercado de R$ 360, o app calcula essas 2 unidades.
Se informo aporte de R$ 60 a R$ 25, o app calcula 2,4 unidades, respeitando
a divisibilidade permitida pelo ativo. Os modos usam relações distintas.

Para saldo manual, antes R$ 10.000 e depois R$ 10.500 resulta em aporte de
R$ 500. Se a mudança for rendimento, o tipo escolhido registra Rendimento,
sem reclassificá-lo como dinheiro novo aportado.

Não fabricar unidades de uma ação por registrar um dividendo. Registre o
retorno financeiro e seu efeito de acordo com os fatos informados. Atualização
de caixa por rendimentos recebidos separadamente continua manual nesta etapa.

## 3. Histórico antigo e transações novas coexistem

Preserve as competências antigas e suas fotografias mensais. Não reconstrua
compras fictícias, preços executados ou rendimentos para explicar diferenças
que só conhecemos como saldos mensais.

Quando uma posição começar a usar transações, use seus valores conhecidos
como **saldo inicial/base** do acompanhamento. Identifique essa origem. Ela
não é aporte novo, rendimento nem custo de aquisição conhecido.

As duas modalidades devem conviver: histórico mensal legado consultável e
acompanhamento com transações no trecho em que os movimentos são registrados.
Não obrigue o usuário a reconstituir todo o passado para começar a usar a
funcionalidade.

Não transforme o saldo de abertura em um preço médio real. Quando o custo
anterior for desconhecido, identifique a limitação nos indicadores pertinentes.
Os movimentos novos devem guardar seus preços e valores efetivos.

## 4. Competências independentes: nenhuma correção em cascata

Esta é uma decisão explícita: **corrigir uma transação de um mês altera
somente aquele mês**. Não recalcular saldos, bases de abertura, transações
ou caixas de competências posteriores já existentes, estejam abertas ou fechadas.

Organize o cálculo por base mensal e movimentações daquela competência,
preservando a avaliação por cotação/indexador aplicável. Evite um modelo que
derive obrigatoriamente todos os meses de um único livro cumulativo global.

Ao criar uma competência ainda inexistente, use uma vez o estado final da
competência de origem como base do novo mês. Não copie transações antigas
como movimentos novos. Depois de criado, o mês mantém sua própria base;
correções retroativas não a modificam.

Exemplo de aceite:

1. Outubro começa com R$ 1.000, recebe R$ 200 e termina com R$ 1.200.
2. Novembro é criado com R$ 1.200, recebe R$ 50 e termina com R$ 1.250.
3. Reabro outubro e corrijo seu aporte para R$ 300: outubro fica R$ 1.300.
4. Novembro permanece com base de R$ 1.200 e saldo de R$ 1.250.
5. Dezembro, criado depois a partir de novembro, começa com R$ 1.250.

Essa independência pode produzir diferenças entre fechamento de um mês
corrigido e abertura do seguinte. Preserve esse comportamento; não crie
ajustes fictícios ou movimentos automáticos para eliminar a diferença.
Os gráficos podem refletir o mês corrigido, mas não devem inventar causas
financeiras para a diferença entre duas fotografias independentes.

## 5. Caixa comum manual; liquidação de vencimento integrada

Aportes e retiradas comuns não debitam/creditam outra posição automaticamente
nesta etapa. Eu faço essas movimentações de caixa manualmente. Não exija
conta de origem/destino nesses formulários.

**Liquidação no vencimento continua nesta etapa e pode transferir o dinheiro
para um caixa escolhido.** É a exceção confirmada ao adiamento acima.

Renomeie o tipo apresentado como Saldo em dólar para **Caixa em dólar**.
Nos tipos Caixa em reais e Caixa em dólar, permita marcar quais posições
funcionam como conta corrente e podem receber a liquidação. Essa condição
deve ser explícita; não inferir pelo nome, instituição ou uso do símbolo USD.

Para título vencido na competência/data relevante, ofereça **Liquidar posição**:

- confirmar data, valor recebido e caixa de destino elegível do mesmo usuário;
- sugerir o saldo conhecido, permitindo informar o valor efetivamente recebido;
- registrar a saída/encerramento do título e a entrada no caixa, vinculadas
  e de forma atômica na mesma competência;
- preservar todo o histórico e impedir crédito duplicado por nova submissão;
- reconhecer transferência interna, sem contar o recebimento no caixa como
  aporte externo ou rendimento novo da carteira;
- respeitar moeda: não fazer conversão cambial implícita;
- se não houver caixa elegível, oferecer caminho para cadastrar/marcar um;
- ao corrigir/remover uma liquidação, manter origem e destino consistentes.

Liquidar em um mês antigo aberto modifica o título e o caixa somente nesse
mês. Não encerrar globalmente nem ocultar posições em meses posteriores já
existentes. Se o próximo mês ainda será criado a partir do mês liquidado,
herde o estado final, sem repetir a transferência.

Exemplo: título de R$ 10.200 e caixa de R$ 800. Liquidação por R$ 10.200
deixa o título zerado e caixa de R$ 11.000 naquela competência. Um mês novo
criado depois herda esses saldos sem um segundo crédito.

Liquidação antecipada não é requisito desta entrega. Retiradas comuns já
permitem registrar saídas; não ampliar automaticamente o botão de vencimento.

## 6. Histórico e explicação de rendimentos

Na página da posição, mostre as transações, suas datas, tipos, quantidades,
preços e valores aplicáveis, com edição disponível no mês aberto. Inclua
marcadores de movimentação nos gráficos quando ajudarem a leitura.

Diferencie aporte, retirada, rendimento e efeito de cotação. Nas partes do
histórico sem operações conhecidas, preserve a identificação das estimativas.
Não apresente diferenças antigas de saldo como transações reais.

Em transferências internas, uma saída e uma entrada não mudam o total de
aportes externos da carteira. Preserve a distinção entre dinheiro investido,
valor de mercado, retorno registrado e custo conhecido.

## 7. Renda fixa com cálculo automático bruto

Comece pela modalidade expressamente exemplificada: aplicação a percentual
do CDI, como 105% CDI. Registre indexador/taxa contratados, data financeira
dos aportes, retiradas e vencimento opcional. Data de cadastro não substitui
a data de aplicação.

Para o passado, acumule o histórico efetivamente observado do indexador.
Para o futuro, mostre uma projeção com hipótese explícita de taxa. Não use
o CDI de um único dia como se tivesse sido constante durante todo o passado.
CDI e Selic têm papéis distintos; não presumir Selic para toda aplicação.

O [Banco Central publica o CDI diário na série 12](https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?hdOidSeriesSelecionadas=12&method=consultarGraficoPorId).
Consulte as convenções financeiras, dias úteis e precisão documentados pela
[B3](https://www.b3.com.br/data/files/2C/84/37/A0/A394F6109A4874F6AC094EA8/Caderno%20de%20Formulas%20-%20CDBs-DIs-DPGE-LAM-LC-LF-LFS-LFSC-LFSN-IECI-RDB.pdf).
Valide acesso à API, cobertura e tratamento de falta de dados.

Nesta etapa, cálculo **bruto, sem IR e IOF**. Mostrar a data da última taxa
usada; não prometer saldo intraday quando a série é diária. Aportes de datas
diferentes não podem render desde a mesma data inicial. Retiradas precisam
reduzir corretamente a base que segue rendendo.

Respeite a independência mensal: uma correção em mês passado não modifica
a base dos meses seguintes já criados. Se faltar principal/data anterior
confiável para calcular um ativo legado, preserve seu saldo conhecido e
permita configurar o início do cálculo, sem inventar dados de aquisição.

Rendimento manual não deve duplicar o retorno já calculado automaticamente.
O cálculo automático deve explicar sua origem e manter uma regra clara para
conferência com o saldo informado. Não criar obrigatoriamente transações
diárias visíveis para representar cada atualização de taxa.

Não ampliar por suposição para prefixado, IPCA ou todos os produtos citados
como CDB/LCI/LCD. Confirmar as modalidades necessárias ao definir essas specs.
Remuneração de caixas pela Selic foi citada como possibilidade futura; não
presumir que todo caixa recebe juros.

## 8. Tesouro Direto por quantidade

Investigue/valide uma fonte gratuita, confiável e com cobertura adequada.
Atualização com atraso é aceitável. Já foi encontrada a
[base oficial diária do Tesouro Transparente](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto),
em CSV, com descoberta via API CKAN. Isso permite estudar identificação por
tipo e vencimento, mesmo sem ticker de bolsa.

Confira os [metadados de preços](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/taxa.pdf)
para escolher o preço adequado à marcação a mercado. Preço unitário, retorno
contratado e dinheiro efetivamente recebido na liquidação são diferentes.

Se a fonte atender aos requisitos, permita selecionar o título/vencimento e
calcule o valor de mercado pela quantidade. Integre ao fluxo de cotações
existente, mostrando data e mantendo o último preço válido em falhas.
Valide cobertura de títulos fora de oferta e com pagamentos periódicos;
não prometer suporte completo sem essa conferência. Não basear a integração
em endpoint antigo não documentado sem confirmar sua disponibilidade.

## 9. Revisão completa no Safari do iPhone 16 Plus

Revise todas as telas: entrada/cadastro, Visão Geral, carteira vazia, Posições,
formulário da posição, detalhe, cotações, Configuração e backup, além do novo
formulário/lista de transações e da liquidação.

Verifique largura, textos e inputs legíveis, teclado aberto, seletores,
diálogos roláveis, validações, salvar/cancelar acessíveis, alvos de toque e
áreas seguras. Preserve zoom de acessibilidade e corrija a fonte do campo
quando ela provocar zoom indesejado.

O relato de swipe espremido não foi localizado em um único controle.
Confira **deslizantes das metas, faixa de competências e gesto de troca de
abas**. Arrastar um slider ou rolar uma tabela não deve trocar de aba.

Use viewport equivalente e Safari/WebKit para verificação local, complementando
os testes atuais. Registre separadamente o que foi verificado em emulação e
o que depende do aparelho real. Não declarar um comportamento específico do
Safari corrigido somente por inspeção de código ou teste no Chrome.

## 10. Integridade, escopo e entrega

- Tudo local. **Nenhum deploy na Vercel ou mudança em serviços de produção.**
- Não executar commits sem a aprovação explícita exigida pelo fluxo do projeto.
- Preservar dados reais e a planilha de referência; não copiar credenciais.
- Testes com gravação usam schema isolado e usuário de teste.
- Manter isolamento de dados por usuário, inclusive transações, bases e destinos.
- Toda mudança de modelo acompanha backup e conversões de versões antigas.
  Verifique a versão atual no código; não presumir que ainda seja a versão 4.
- Usar decimais e regras de precisão adequadas, evitando deriva monetária.
- Validar mutações no servidor, mês aberto, relações, limites e duplicidade.
- Preservar as specs 053–055 e o trabalho local já existente.
- Não criar telas de roadmap, progresso de specs ou pendências de desenvolvimento.
- Previdência fica fora desta evolução.

Organize em fatias revisáveis: base mensal/transações/backup; formulário e
separação do lápis; histórico e indicadores; caixa/liquidação; CDI bruto;
Tesouro condicionado à fonte; revisão mobile. A revisão mobile pode começar
nas telas existentes e ser repetida apenas nos novos fluxos depois.

Inclua critérios de aceite para os exemplos deste briefing, principalmente:
correção de uma transação sem cascata; virada de mês sem duplicação; saldo
inicial que não vira aporte; separação entre preço executado e cotação;
liquidação atômica sem dupla entrada; backup antigo e novo; dois usuários;
CDI com múltiplos aportes/retirada e telas no iPhone.

Use o código para verificar o que já foi entregue e o que está parcial.
Documente decisões de implementação e limitações nas fontes responsáveis.
Questões de cobertura de produtos/fontes podem ser esclarecidas ao definir
essas fatias, sem reabrir as regras de flexibilidade e meses já confirmadas.
