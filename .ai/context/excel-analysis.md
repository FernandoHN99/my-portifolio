# Diagnóstico do Excel

Análise inicial: 2026-09-21
Última verificação: 2026-10-01
Fonte atual: `raw_file/01-Investimentos.xlsm`.
Método: leitura estática do conteúdo OOXML, dos valores salvos e dos
módulos VBA exportados em `raw_file/automacaoVBA/`.

A versão atual também foi comparada com o arquivo registrado no commit
`86d4f27`. O resumo fornecido pelo usuário em 2026-10-01 foi usado como
fonte secundária e conferido contra os arquivos.

A planilha não foi alterada. As macros não foram executadas e as APIs
não foram consultadas. O funcionamento ao vivo e a aparência no Excel
continuam sem validação.

## Inventário

- 6 abas.
- 14 tabelas estruturadas.
- 10 tabelas dinâmicas e 2 caches.
- 12 gráficos.
- 10 segmentações de dados.
- 3.266 células com fórmulas.
- 15 componentes VBA no projeto: 7 módulos padrão, 1 classe e 7
  componentes do arquivo e das abas. Os oito arquivos com lógica
  estão exportados em `raw_file/automacaoVBA/`.
- 365 registros de posições, 383 de classificação e 156 de cotações.
- 31 meses registrados entre junho de 2023 e setembro de 2026,
  com lacunas no histórico.

## Fluxo funcional observado

`Cotacoes` fornece preços para `Investimentos_Main`.
`Investimentos_Porcent` distribui as posições entre classificações.
`Tables_Atual_Ideal` consolida valores e compara com metas.
`Graficos` apresenta patrimônio, distribuições e rebalanceamento.
`Previdencia` mantém rendimentos, contribuições e cálculo de pendência.

A carteira é organizada por posições mensais. Não foi encontrado
um livro estruturado de compras, vendas, custos e proventos.

Uma posição pode ter várias classificações ponderadas, incluindo
classe, subclasse e prazo. Estratégia e moeda também participam
das análises.

Ativos com ticker usam quantidade e cotação. Ativos sem ticker
utilizam saldo manual. O VBA converte preços estrangeiros para BRL
antes do cálculo da posição; a moeda de referência permanece
registrada separadamente.

## VBA

- `modMain`: coordena atualização, recálculo e salvamento.
- `modInvestments`: copia posições e classificações para o novo mês.
- `modQuotes`: busca, converte e grava cotações.
- `modTables`: localiza tabelas e manipula conjuntos mensais.
- `modHttp`: HTTP por curl no Mac e WinHTTP/MSXML no Windows.
- `modJson`: extração simplificada de campos das respostas.
- `modConfig`: constantes, serviços e credenciais.
- `KeyValueStore`: dicionário compatível com o Excel para Mac.

Os componentes do arquivo e das abas não contêm procedimentos
de eventos.

O botão “Atualizar Planilha” chama `AtualizarInvestimentos`.
A rotina copia o último conjunto quando muda o mês, busca preços,
registra a atualização, recalcula e salva.

O `modMain.bas` exportado não chama `RefreshAll`. Portanto, a atualização
dos pivôs não faz parte do fluxo explícito desse módulo, mesmo que o
arquivo atual tenha sido salvo com os caches atualizados.

Os serviços presentes no código são AwesomeAPI, CoinGecko, Finnhub
e Alpha Vantage. A existência dessa integração não comprova
disponibilidade ou funcionamento atual dos serviços.

Não existe agendamento no arquivo nem preenchimento automático
dos meses intermediários ausentes.

O comportamento detalhado e os riscos dos módulos estão registrados em
[Análise dos módulos VBA](vba-analysis.md).

## Análises e controles

Os gráficos apresentam patrimônio; classe, moeda e estratégia;
renda fixa por prazo; classe por moeda; e renda variável por moeda.
Várias dessas visões possuem comparações entre atual e ideal.

Existem filtros distintos para mês dos gráficos, período do
patrimônio, classificação do rebalanceamento, tabelas de dados
e anos da previdência.

As metas cobrem classes, moedas, estratégias, moeda por classe,
renda fixa por indexador/prazo e subclasses de renda variável.

O rebalanceamento possui 25 comparações. A diferença é calculada
como atual menos ideal. A regra marca VENDER quando positiva
e COMPRAR nos demais casos, inclusive zero. Não executa ordens.

A previdência calcula períodos trabalhados, renda proporcional
quando indicada, contribuições por ano e pendência conforme
o percentual de 12% fixado na planilha.

## Comparação com a versão anterior

A estrutura, os registros das tabelas e as fórmulas da versão atual são
semanticamente equivalentes aos da versão registrada anteriormente.
A diferença funcional observada está nos caches das tabelas dinâmicas e
nos resultados consolidados salvos.

Na versão anterior, duas posições de setembro de 2026, Flexible Account
e Porquinho, não apareciam no cache. A diferença era R$ 1.045,80. No
arquivo atual, o total salvo em `Tables_Atual_Ideal!C11` passou de
R$ 251.151,12 para R$ 252.196,92 e o cache contém essas posições.
Esse achado está resolvido no arquivo atual, mas permanece relevante para
projetar uma atualização que não dependa de cache manual.

O arquivo atual também contém metadados de uma extensão de painel do
Office que não existiam na versão registrada. Não foi identificado efeito
dessas partes sobre as regras financeiras.

## Achados ainda pendentes antes da migração

1. As buscas por data e nome ignoram instituição. Nomes repetidos
   fazem a classificação reutilizar a primeira posição encontrada.
   Existem diferenças nos totais históricos de outubro/2023,
   dezembro/2023, janeiro/2024, julho/2025, agosto/2025
   e setembro/2025.

2. A linha 5 de Investimentos_Main e Investimentos_Porcent contém
   textos em campos numéricos e calculados.
   `modTables.IsFormulaColumn` verifica somente a primeira linha,
   criando risco de sobrescrever fórmulas durante a duplicação.

3. Tables_Atual_Ideal!M80:M81 e M88:M92 usam o total ideal da
   classe como denominador do percentual atual, diferentemente
   de outras comparações.

4. As metas gerais de moeda em J29:L33 não coincidem com a
   composição implícita das metas de classe e moeda em J5:O19.
   A intenção dessa independência ainda precisa ser discutida.

5. As macros dependem da ordem das linhas, podem gravar “Error”
   como cotação e absorvem alguns erros intermediários.
   Não há reversão integral da atualização.

6. A previdência possui filtros anuais independentes para rendas
   e contribuições. Os cálculos conferiram com os valores salvos,
   mas a seleção pode combinar anos diferentes.

7. Há credenciais no VBA, um campo calculado experimental TESTE
   com referência inválida, o nome definido oi com #REF! e
   anotações avulsas em Graficos!W26:X29.

## Reconciliação do resumo recebido

O resumo fornecido em 2026-10-01 descreve corretamente o funcionamento
geral, o histórico mensal, as metas, o rebalanceamento e a previdência.
Dois números foram atualizados pela inspeção direta:

- existem 14 tabelas estruturadas, não 11;
- o patrimônio consolidado salvo para setembro de 2026 é
  R$ 252.196,92 no arquivo atual.

O resumo não teve acesso ao VBA. As inferências sobre a automação foram
substituídas pela leitura direta dos módulos exportados.

Não reproduzir credenciais neste contexto. Não tratar os achados
como regras desejadas ou correções aprovadas. O diagnóstico deve
ser atualizado quando houver nova evidência ou decisão do usuário.
