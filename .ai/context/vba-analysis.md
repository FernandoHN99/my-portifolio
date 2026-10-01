# Análise dos módulos VBA

Data da análise: 2026-10-01
Fontes: `raw_file/automacaoVBA/` e diagnóstico estático do projeto VBA
embutido em `raw_file/01-Investimentos.xlsm`.

Os módulos foram apenas lidos. Nenhuma macro foi executada, nenhuma API
foi consultada e nenhuma credencial foi reproduzida nesta documentação.

## Inventário

A pasta exportada contém sete módulos padrão e uma classe:

- `modMain.bas`
- `modInvestments.bas`
- `modQuotes.bas`
- `modTables.bas`
- `modHttp.bas`
- `modJson.bas`
- `modConfig.bas`
- `KeyValueStore.cls`

O projeto embutido também possui sete componentes do arquivo e das abas.
Na extração estática anterior, esses componentes não continham rotinas de
evento. A pasta exportada concentra toda a lógica identificada.

## Fluxo de atualização

O botão da planilha chama `AtualizarInvestimentos`, em `modMain`:

1. desativa atualização de tela, eventos e cálculo automático;
2. atualiza os blocos mensais de posições e classificações;
3. atualiza ou insere o bloco mensal de cotações;
4. grava o horário de atualização nas abas de investimentos;
5. restaura o estado do Excel;
6. executa `Application.CalculateFull`;
7. salva o arquivo.

O fluxo não chama `RefreshAll`. Ele também não é transacional: se uma
etapa falhar após alterações parciais, o tratador restaura o estado da
interface, mas não desfaz linhas ou valores já gravados.

## Posições mensais

`modInvestments` processa `Investimentos_Main` e
`Investimentos_Porcent`. Quando a maior data é anterior ao primeiro dia
do mês atual, `modTables.DuplicateLastRowsToNewDate` duplica o último
bloco encontrado e troca a data. Se o mês já existe, não altera posições.

`GetLastRows` varre a tabela de baixo para cima e considera que o último
bloco está contíguo no fim da tabela. A ordem física das linhas, portanto,
faz parte do comportamento implícito.

Ao duplicar, colunas detectadas como fórmulas não são copiadas como valor.
`IsFormulaColumn` faz essa detecção olhando somente a primeira linha de
dados. Como a primeira linha das tabelas de investimentos contém textos
em campos calculados, a classificação de uma coluna pode ficar errada.

O processo cria apenas o mês atual. Se houver meses intermediários sem
registro, eles não são preenchidos.

## Cotações

`modQuotes` escolhe o provedor pela categoria e pela moeda-base:

| Caso | Provedor |
| --- | --- |
| Câmbio (`FIAT`) | AwesomeAPI |
| Criptomoeda (`CRIPTO`) | CoinGecko |
| Demais ativos com base USD | Finnhub |
| Demais ativos com outra base | Alpha Vantage |

O último bloco de `Cotacoes` é usado como cadastro dos ativos. No primeiro
uso de um novo mês, as linhas são adicionadas com a data corrente; dentro
do mesmo mês, os valores desse bloco são sobrescritos.

As taxas de câmbio são buscadas primeiro. Preços de ativos tradicionais
que não são classificados como FIAT ou CRIPTO são então convertidos para
BRL com a taxa encontrada para a moeda-base. Criptomoedas já são pedidas
ao CoinGecko em BRL.

Consequências observadas:

- uma falha pode gravar o texto `Error` em uma coluna de cotação;
- se faltar a taxa de conversão, o preço numérico pode permanecer sem
  conversão, sem um estado que indique a moeda efetiva daquele valor;
- não há retentativa, registro de resposta, identificador da fonte nem
  tabela de erros;
- a espera do Alpha Vantage é de 0,15 segundo, incompatível com o comentário
  do próprio código sobre aproximadamente cinco chamadas por minuto;
- a resolução alternativa de um ativo no CoinGecko usa o primeiro resultado
  compatível de uma busca e pode escolher o ativo errado;
- uma atualização dentro do mês substitui a cotação mensal anterior.

## HTTP, JSON e configuração

`modHttp` usa `curl` chamado por AppleScript no macOS e WinHTTP ou MSXML
no Windows. Falhas retornam string vazia. O timeout configurável de
`modConfig` não é usado no caminho do macOS; o comando possui 30 segundos
fixos. O código não valida explicitamente o status HTTP.

`modJson` não é um parser JSON completo. Ele procura texto por chave e
converte o primeiro número encontrado. Respostas com chaves repetidas,
ordem diferente ou estrutura inesperada podem produzir um valor incorreto.

`modConfig` contém endpoints, constantes e três credenciais em texto
simples. As credenciais não devem ser migradas para o código nem para a
documentação; no aplicativo, precisam vir de variáveis de ambiente ou de
outro armazenamento local de segredos.

`KeyValueStore` implementa um dicionário por meio de duas coleções, com
busca linear e chaves sensíveis a maiúsculas e minúsculas. Ele existe para
compatibilidade com o Excel no Mac, não como regra de negócio.

## Requisitos derivados para o aplicativo

Estes itens são consequências do comportamento observado, ainda não uma
decisão de implementação:

- separar cadastro do ativo, posição mensal, preço diário e taxa de câmbio;
- identificar uma posição por chaves estáveis que incluam instituição,
  sem depender do nome ou da ordem das linhas;
- executar a atualização de um período em transação, com resultado
  explícito por item e possibilidade de repetir somente as falhas;
- guardar fonte, instante, moeda original e moeda convertida de cada preço;
- validar respostas com um parser JSON real e contratos por provedor;
- representar indisponibilidade como estado, nunca como texto em campo
  numérico;
- recalcular consolidações a partir dos dados persistidos, sem cache manual;
- impedir que uma atualização de preço altere quantidades ou reabra uma
  posição mensal fechada sem uma ação explícita;
- manter credenciais fora do repositório.

## Validações que ainda exigem o Excel

- confirmar visualmente o vínculo e o comportamento do botão;
- executar a macro com respostas válidas e inválidas em cópia descartável;
- confirmar o comportamento nos sistemas operacionais realmente usados;
- verificar se há ação externa que atualiza pivôs antes ou depois da macro;
- observar mensagens e estados intermediários em falhas parciais.
