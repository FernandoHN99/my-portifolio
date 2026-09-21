# Diagnóstico inicial do Excel

Data da análise: 2026-09-21
Fonte: `01-Investimentos.xlsm`, na raiz do projeto.
Método: leitura estática do conteúdo OOXML, dados salvos e código VBA.

A planilha não foi alterada. As macros não foram executadas e as
APIs não foram consultadas com as credenciais presentes no arquivo.
Funcionamento ao vivo e aparência no Excel não foram validados.

## Inventário

- 6 abas.
- 14 tabelas estruturadas.
- 10 tabelas dinâmicas e 2 caches.
- 12 gráficos.
- 10 segmentações de dados.
- 3.266 células com fórmulas.
- 15 componentes VBA: 7 módulos padrão, 1 classe e 7 componentes
  do arquivo e das abas.
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

- `modMain`: coordena atualização, recálculo, pivôs e salvamento.
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
registra a atualização, recalcula, atualiza pivôs e salva.

Os serviços presentes no código são AwesomeAPI, CoinGecko, Finnhub
e Alpha Vantage. A existência dessa integração não comprova
disponibilidade ou funcionamento atual dos serviços.

Não existe agendamento no arquivo nem preenchimento automático
dos meses intermediários ausentes.

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

## Achados para validação antes da migração

1. O cache dos pivôs está desatualizado em relação a duas posições
   de setembro de 2026: Flexible Account e Porquinho.
   A diferença agregada é R$ 1.045,80.
   Referências: Investimentos_Porcent, linhas 365 e 378;
   Tables_Atual_Ideal, C11; cache de Table_Investimentos_Porcent.

2. As buscas por data e nome ignoram instituição. Nomes repetidos
   fazem a classificação reutilizar a primeira posição encontrada.
   Existem diferenças nos totais históricos de outubro/2023,
   dezembro/2023, janeiro/2024, julho/2025, agosto/2025
   e setembro/2025.

3. A linha 5 de Investimentos_Main e Investimentos_Porcent contém
   textos em campos numéricos e calculados.
   `modTables.IsFormulaColumn` verifica somente a primeira linha,
   criando risco de sobrescrever fórmulas durante a duplicação.

4. Tables_Atual_Ideal!M80:M81 e M88:M92 usam o total ideal da
   classe como denominador do percentual atual, diferentemente
   de outras comparações.

5. As metas gerais de moeda em J29:L33 não coincidem com a
   composição implícita das metas de classe e moeda em J5:O19.
   A intenção dessa independência ainda precisa ser discutida.

6. As macros dependem da ordem das linhas, podem gravar “Error”
   como cotação e absorvem alguns erros intermediários.
   Não há reversão integral da atualização.

7. A previdência possui filtros anuais independentes para rendas
   e contribuições. Os cálculos conferiram com os valores salvos,
   mas a seleção pode combinar anos diferentes.

8. Há credenciais no VBA, um campo calculado experimental TESTE
   com referência inválida, o nome definido oi com #REF! e
   anotações avulsas em Graficos!W26:X29.

Não reproduzir credenciais neste contexto. Não tratar os achados
como regras desejadas ou correções aprovadas. O diagnóstico deve
ser atualizado quando houver nova evidência ou decisão do usuário.
