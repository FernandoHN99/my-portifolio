# 003 — Atualização mensal manual

Estado: concluída
Definida em: 2026-10-01

## Problema

A planilha cria o mês a partir do último conjunto de posições e consulta
cotações quando o usuário aciona o botão. O aplicativo precisa preservar
esse fluxo, eliminando gravações parciais e valores inválidos.

## Objetivo

Oferecer uma ação manual que copie as posições do mês anterior, consulte as
cotações e deixe o novo mês disponível para edição.

## Comportamento esperado

1. O usuário clica em atualizar.
2. O sistema verifica se o mês atual já existe.
3. Se necessário, copia as posições do último mês para um novo rascunho.
4. Busca cotações somente nesse momento e enquanto a aplicação está ativa.
5. Converte preços preservando moeda, fonte e horário.
6. Mostra sucesso ou falha de cada item.
7. O usuário altera quantidades, saldos e classificações manualmente.

Atualização em 2026-10-02: o usuário separou a atualização de cotações da
criação do mês. As cotações passaram a ser atualizadas ao abrir o aplicativo e
pela seta do topo ([spec 020](020-daily-quotes.md)), e as competências
faltantes passaram a ser criadas automaticamente, inclusive as intermediárias
([spec 021](021-automatic-month-rollover.md)). A atualização do topo
aplica cada símbolo de forma independente, em vez de tudo ou nada; é uma
proposta do agente que aguarda o usuário, registrada em "Questões em aberto"
da spec 020. A [spec 022](022-quotes-page.md) removeu `/atualizacao`, o botão
"Atualizar carteira" e o código deste fluxo; as execuções já registradas
aparecem em leitura no histórico da página de cotações, e as regras abaixo
ficam como registro.

## Regras confirmadas

- não existe agendamento em segundo plano;
- não atualizar com o computador ou aplicativo desligado;
- respeitar os limites gratuitos dos provedores;
- não preencher automaticamente meses intermediários sem confirmação;
- não gravar texto em campo numérico;
- mudanças de preço não alteram quantidade;
- a operação deve ser transacional e repetível.

## Provedores selecionados

- AwesomeAPI para câmbio em BRL. A documentação informa cache de um minuto
  sem chave e até 100 mil solicitações mensais gratuitas com chave:
  <https://docs.awesomeapi.com.br/api-de-moedas>.
- CoinGecko Demo para cripto, agrupando moedas em uma única chamada. O plano
  gratuito informa 10 mil créditos por mês e 100 chamadas por minuto:
  <https://www.coingecko.com/pt-br/api/pricing>.
- Finnhub para ações e ETFs cotados em USD. A integração respeitará `429` e o
  limite associado à conta configurada:
  <https://finnhub.io/docs/api/quote>.
- Alpha Vantage para ativos restantes, com orçamento explícito de 25 chamadas
  gratuitas por dia:
  <https://www.alphavantage.co/support/>. A checagem de ticker de ativos novos
  da [spec 026](026-new-position-entities.md) também gasta desse orçamento.

As chaves ficam somente em variáveis de ambiente locais. O aplicativo não
copiará as credenciais encontradas no VBA.

## Decisões de execução

- posições sem símbolo de cotação são copiadas sem alterar saldo;
- a cotação de cada símbolo é buscada uma única vez por atualização;
- nenhuma cotação parcial altera os valores do mês: todas as respostas são
  validadas antes da gravação;
- falhas permanecem registradas e o rascunho conserva os últimos preços;
- repetir a ação para a mesma competência reutiliza o rascunho existente;
- edição e fechamento do rascunho serão especificados separadamente.

## Dependência

Conclusão das specs 001 e 002.

## Implementado nesta etapa

- criação transacional do rascunho a partir da última competência;
- reutilização do mesmo rascunho e execução em novas tentativas;
- adaptadores independentes para AwesomeAPI, CoinGecko, Finnhub e Alpha
  Vantage;
- agrupamento por símbolo para evitar chamadas repetidas;
- validação das respostas com Zod e tempo limite de rede;
- persistência do resultado e da falha de cada cotação;
- aplicação atômica: qualquer falha mantém todos os preços anteriores;
- tela para iniciar, acompanhar e repetir a atualização;
- indicação de rascunho na visão geral.

## Verificação

Em 2026-10-01, as credenciais existentes no VBA foram transferidas diretamente
para o `.env` local, sem exposição dos valores e sem incluí-las no Git. Uma
atualização iniciada pela interface reutilizou o rascunho de outubro de 2026 e
concluiu as 10 cotações previstas sem falhas.

Antes da chamada real, um banco temporário validou as quatro migrações, a
importação, a normalização, a idempotência e a aplicação atômica com provedores
simulados. Uma tentativa sem as variáveis carregadas também confirmou que
falhas parciais preservam integralmente os preços anteriores.
