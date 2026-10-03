# Passo pré-produção

Registrado em: 2026-10-02
Origem: respostas do usuário às questões em aberto (segunda rodada), em
[Reestruturação da UX](ux-restructure.md).
Estado: planejado; não executado.

Antes de subir o aplicativo para produção, o usuário e o agente vão preparar,
uma única vez, um histórico completo e correto. Até lá, o aplicativo **não**
altera os dados antigos importados da planilha.

## O que o arquivo deve trazer

- todas as competências desde o início do histórico, sem lacunas: hoje faltam
  agosto, setembro e novembro de 2023, julho de 2024 e fevereiro a junho de
  2025. Cada mês faltante recebe as posições do mês existente anterior,
  duplicadas; um mês existente passa a ser a base dos seguintes;
- para cada ativo com ticker, a cotação de fechamento do último dia de cada
  mês, buscada nos provedores gratuitos;
- todas as colunas e valores revisados: quantidades, totais, rateio e
  estratégia;
- a revisão das classificações herdadas, por exemplo:
  - prazos D+0 e D+1 dentro de renda fixa. Na planilha, a duração é o prazo
    de resgate para liquidez, não o tempo até o vencimento;
  - o BTC classificado como renda fixa de outubro a dezembro de 2025;
  - a linha inconsistente de Bitcoin de junho de 2023;
- vencimentos dos ativos importados, informados pelo usuário. Nada deve ser
  inferido pelo nome do ativo;
- a moeda base das criptos que não são o BTC como "Altcoins"
  ([spec 036](../specs/036-altcoins-currency.md)), inclusive os ativos antigos
  de cripto com ticker USD;
- o resgate de cada classificação como Curto, Médio, Longo ou Nenhum
  ([spec 035](../specs/035-redemption-and-known-classes.md)), no lugar de D+0
  e D+1.

## O que não é funcionalidade do aplicativo

Preencher meses faltantes do passado, por botão ou automaticamente, não será
implementado no aplicativo. A virada de mês automática
([spec 021](../specs/021-automatic-month-rollover.md)) continua criando
somente os meses posteriores à competência mais recente.

O que o aplicativo faz de hoje em diante:

- guarda, para cada mês, a cotação de fechamento (a mais recente do mês) de
  cada ativo com ticker;
- ao incluir um ativo novo, busca a cotação de fechamento mensal dos últimos
  três anos, conforme os limites de cada provedor
  ([spec 029](../specs/029-asset-price-history.md)).

## Depois do passo

- a variação no mês e em 12 meses deixa de mostrar "Histórico insuficiente"
  nos meses que hoje são lacunas;
- o início de "Todo o período" pode voltar para a primeira competência, se o
  usuário quiser.
