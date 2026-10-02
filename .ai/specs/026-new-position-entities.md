# 026 — Inclusão de posição com conta, instituição, ativo e vencimento novos

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

Pedido do usuário em 2026-10-02, registrado em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência":

> "Deixar o botão adicionar posição mais em evidencia. Ainda falando dele
> deixar digitar valores para novas contas, mesma coisa para ativos,
> estrategia deixe como está! Deixar tb incluir nova sigla de etf açoes vc ja
> tem o contexto para q serve cada endpoint um para cada coisa e ai
> selecionando a classe vc ja chama o endpoint p checar se a o ticker existe,
> Algo muito importante renda fixa permitir de forma opcional data de limite
> hoje eu adicionei no proprio name."

Respostas do usuário no mesmo dia, registradas no mesmo documento: o
vencimento da renda fixa é informativo, aparece na tabela e na página da
posição com aviso de vencido ou vencendo; a duração Curto, Médio e Longo
continua manual no rateio; o vencimento vale só para ativos novos, e nomes
como "LCI BRB - Set/26" ficam como estão.

Fatos observados no código antes da mudança:

- "Adicionar posição" era um botão pequeno e secundário na barra de filtros,
  visível só no modo de edição ([spec 019](019-pencil-edit-mode.md));
- o diálogo tinha um único campo "Conta", com "Instituição · Conta", e o
  campo "Ativo", ambos restritos aos cadastros existentes
  ([spec 017](017-positions-editing.md), em "Limites conhecidos");
- o ativo não guarda tipo: o provedor de um símbolo sai do tipo de
  instrumento e da moeda base da cotação em `market_quotes`, como na
  planilha (`FIAT` na AwesomeAPI, `CRIPTO` na CoinGecko, demais com base USD
  no Finnhub e os outros no Alpha Vantage, conforme
  [análise do VBA](../context/vba-analysis.md), em "Cotações");
- a CoinGecko só conhecia BTC e SOL, por identificadores fixos; outro cripto
  falharia em toda atualização;
- todas as contas importadas se chamam "Principal", uma por instituição, e o
  vencimento dos títulos estava no próprio nome do ativo.

## Objetivo

Incluir uma posição com instituição, conta e ativo novos sem sair da tela,
conferindo o ticker no provedor certo, com o rateio inicial já preenchido e o
vencimento opcional dos títulos, tudo gravado na mesma transação da posição.

## Comportamento

### Botão em evidência

- "Adicionar posição" fica no topo de Posições, ao lado de "Editar posições",
  com o estilo principal, dentro e fora do modo de edição;
- fora do modo de edição, na competência mais recente, o botão entra em
  edição e abre o diálogo; numa competência passada, abre antes a mesma
  confirmação de histórico do lápis e, confirmada, entra em edição e abre o
  diálogo;
- a entrada antiga na barra de filtros saiu.

### Instituição e conta

- o campo "Conta" virou dois: "Instituição" e "Conta", esta habilitada depois
  de escolher a instituição;
- os dois aceitam um valor digitado: sem opção correspondente, a lista oferece
  "Criar “texto”"; um nome existente, mesmo com outra caixa, acento ou
  pontuação, escolhe o existente em vez de criar;
- uma instituição com uma única conta já escolhe essa conta; uma instituição
  nova começa com a conta nova "Principal", como as importadas, e aceita outro
  nome;
- instituições, contas e ativos novos de outras posições ainda não salvas
  aparecem nas listas com a marca "nova" ou "novo".

### Ativo novo

- o campo "Ativo" aceita um nome novo, inclusive igual ao de um ativo
  existente: o existente continua primeiro e "Criar “nome”" vem por último;
- um ativo novo abre o bloco "Novo ativo", com o tipo, o ticker quando o tipo
  tem um, o vencimento quando o tipo admite, a cotação digitada quando
  necessária e o rateio inicial.

Tipos, derivados do roteamento de provedores e da taxonomia de rateio:

| Tipo | Ticker | Provedor | Tipo de instrumento | Moeda base | Rateio inicial | Vencimento |
|---|---|---|---|---|---|---|
| ETF dos EUA | digitado | Finnhub | ETF | USD | Renda Variável · Ações EUA · - | não |
| Ação dos EUA | digitado | Finnhub | ACAO | USD | Renda Variável · Ações EUA · - | não |
| ETF da B3 | digitado, com `.SAO` | Alpha Vantage | ETF | BRL | Renda Variável · Ações BR · - | não |
| Ação ou FII da B3 | digitado, com `.SAO` | Alpha Vantage | ACAO | BRL | Renda Variável · Ações BR · - | não |
| Cripto | digitado | CoinGecko | CRIPTO | BTC para BTC, USD para os demais | Cripto · BTC ou Altcoin · - | não |
| Renda fixa | sem ticker | — | — | BRL | Renda Fixa · escolher · escolher | opcional |
| Caixa em reais | sem ticker | — | — | BRL | Caixa · Pós-fixado · D+0 | opcional |
| Saldo em dólar | USD | cotação do dólar do mês | FIAT | USD | Caixa · Pós-fixado · D+0 | opcional |

### Checagem do ticker

- meio segundo depois da última tecla, o diálogo pergunta à rota
  `POST /api/quotes/ticker-check` se o provedor do tipo conhece o ticker; um
  texto que mudou cancela a consulta anterior;
- estados mostrados abaixo do campo:
  - "Verificando VOO no Finnhub…";
  - encontrado: "ETH encontrado (Ethereum) no CoinGecko: R$ 13.456,78 hoje.";
  - já cotado na competência: "VOO já tem cotação nesta competência: …",
    sem consultar o provedor;
  - não encontrado: "Finnhub não encontrou o ticker XYZ." — incluir fica
    bloqueado;
  - símbolo já cotado por outro provedor, como BTC escolhido como ETF —
    bloqueado;
  - provedor indisponível, sem chave, com limite de uso ou sem câmbio do dia:
    "Finnhub indisponível: … Informe a cotação para salvar." — aparece o campo
    "Cotação em R$", obrigatório;
  - falha da própria rota: "Não foi possível conferir o ticker agora." com
    "Tentar de novo";
- encontrado numa competência passada também pede a cotação em reais daquele
  mês, porque o preço obtido é o de hoje.

### Salvar e desfazer

- "Adicionar" coloca a posição pendente na tabela, com o rateio escolhido e o
  vencimento; nada é gravado até "Salvar", como antes;
- salvar cria, na mesma transação das posições, as instituições, contas e
  ativos novos, a cotação do mês do símbolo novo e o rateio inicial a 100%;
- ticker encontrado na competência do mês corrente: a cotação do mês recebe o
  preço conferido, com `quote_date` do dia, e o histórico diário recebe a
  cotação do dia, com o provedor e o horário da consulta;
- cotação digitada: a cotação do mês recebe o valor digitado, sem
  `quote_date`, como a edição à mão da página de cotações; se o ticker foi
  encontrado, a cotação de hoje entra no histórico diário mesmo assim;
- o aviso de alterações salvas mantém "Desfazer": ele restaura a competência e
  remove as instituições, contas, ativos e cotações diárias criados que
  ficaram sem uso.

### Vencimento na tabela

- abaixo do nome do ativo aparece um selo: "vence em Jun/27"; "vence em 12
  dias", "vence amanhã" ou "vence hoje" em tom de aviso a partir de 30 dias;
  "vencido" em vermelho; a dica traz a data completa;
- o dia de referência é hoje na competência do mês corrente e o último dia do
  mês nas demais, para o histórico não mostrar como vencido um título que
  venceu depois.

## Modelo de dados

Migração aditiva `20261002070219_asset_maturity_date`: coluna
`assets.maturity_date`, `DATE` nulo. Nenhum dado existente foi alterado.

`market_quotes.instrument_type` e `daily_quotes.instrument_type` passam a
admitir `ACAO`, além de `ETF`, `FIAT` e `CRIPTO`; a página de cotações mostra
"Ação".

Chave dos ativos novos, no formato da importação: `market:<nome>:<TICKER>`
para ativos com ticker e `private:<instituição>:<nome>` para os demais, com
`:<vencimento>` no fim quando há vencimento.

## Decisões tomadas

- interpretação de "mais em evidência": botão principal no topo, dentro e
  fora do modo de edição, consistente com o lápis da spec 019; fora do modo de
  edição o botão entra em edição antes de abrir o diálogo. A entrada na barra
  de filtros saiu para haver um lugar só;
- interpretação de "digitar valores para novas contas": instituição e conta
  aceitam valores novos. Como cada conta pertence a uma instituição, o campo
  único "Instituição · Conta" virou dois campos. A conta "Principal" sugerida
  para instituição nova segue o padrão de todas as contas importadas;
- duplicados são comparados como na importação: sem acentos, caixa nem
  pontuação. Na interface, digitar um nome existente escolhe o existente; no
  servidor, uma instituição, conta ou ativo duplicado recusa o salvamento com
  a indicação de escolher o existente;
- interpretação de "mesma coisa para ativos": o ativo aceita nome novo. Um
  nome igual ao de um ativo existente pode ser criado, porque o vencimento
  passa a diferenciar títulos como "LCI BRB" que antes levavam o prazo no
  nome; o servidor recusa se nome, ticker ou instituição e vencimento
  coincidirem;
- "estratégia deixe como está": a lista de estratégia não mudou;
- interpretação de "selecionando a classe vc já chama o endpoint": a "classe"
  é o tipo do ativo novo, que decide o provedor, e não a classe do rateio. Os
  oito tipos da tabela acima saíram do roteamento da planilha e das classes e
  subclasses existentes. ETF e ação ficam separados para o tipo de
  instrumento ser fiel, com o novo valor `ACAO`; o provedor é o mesmo;
- na B3 o ticker recebe o sufixo `.SAO` do Alpha Vantage, como o
  `GPCA11.SAO` importado; o usuário digita só `GPCA11`;
- moeda base do cripto: BTC tem a própria moeda, como na planilha; os demais
  ficam em USD, como a Solana, que é o que a meta "Cripto em USD" acompanha;
- USD e BRL não são aceitos como ticker digitado; saldos em dólar usam o tipo
  "Saldo em dólar", cotado pelo dólar do mês como Time Deposit e USDC;
- não encontrado, por provedor: Finnhub responde HTTP 200 com preço zero;
  Alpha Vantage responde "Global Quote" vazio; na CoinGecko, nenhuma moeda com
  exatamente aquele símbolo. Avisos de limite ou de chave do Alpha Vantage
  ("Note", "Information", "Error Message") não provam que o ticker falta e
  contam como provedor indisponível;
- conforme a orientação da fatia: não encontrado bloqueia; provedor
  indisponível permite salvar com aviso e cotação digitada; encontrado grava a
  cotação do mês e a do dia;
- numa competência passada o preço encontrado não vale para o mês, porque a
  cotação de uma competência é a do último dia dela
  ([spec 021](021-automatic-month-rollover.md)); por isso a cotação daquele mês
  é digitada;
- a CoinGecko resolve tickers sem identificador fixo pela própria busca,
  escolhendo, entre as moedas com exatamente aquele símbolo, a de maior
  capitalização. O nome encontrado aparece na checagem para o usuário
  conferir, porque a planilha tinha o risco conhecido de escolher a moeda
  errada. A mesma regra passou a valer na atualização de cotações da
  [spec 020](020-daily-quotes.md), para o cripto novo continuar sendo
  atualizado; BTC e SOL mantêm os identificadores fixos;
- a checagem é uma rota, e não uma Server Action como sugeria a orientação da
  fatia, pelo mesmo motivo da spec 020: o Next despacha Server Actions uma
  por vez, e uma consulta de vários segundos seguraria o salvamento. A rota
  também permite cancelar a consulta de um texto que mudou. Ela exige JSON e a
  mesma origem, como as rotas de cotações;
- o resultado da checagem fica no servidor por duas horas sob um token
  opaco, como o desfazer da spec 017. Ao salvar, o servidor usa o preço do
  token e exige token para todo símbolo sem cotação no mês; o preço enviado
  pelo navegador nunca vale como cotação conferida, e não encontrado nunca
  recebe token. Se o servidor reiniciar ou o token expirar, o salvamento pede
  para incluir a posição de novo;
- interpretação de "data de limite": vencimento opcional. Vale para renda
  fixa e também para caixa em reais e saldo em dólar, que têm títulos com
  prazo, como "LCD BDMG LIQUIDEZ - 05/32" e Time Deposit; não vale para ativos
  com ticker de mercado. É informativo e não muda a duração do rateio;
- o selo de "vencendo" começa a 30 dias do vencimento;
- vencimento editável depois: não nesta fatia, só na criação. Um vencimento
  errado logo após salvar se corrige com "Desfazer"; editar depois fica com a
  página da posição da [spec 016](016-position-history.md);
- nomes existentes não são analisados nem preenchidos com vencimento;
- rateio inicial: uma classificação a 100%, preenchida pelo tipo e editável
  com as listas do painel de rateio, inclusive "Usar" para um valor novo.
  Renda fixa exige escolher subclasse e duração antes de incluir, para a
  posição não ficar fora das análises. Para dividir entre classes, o painel
  de rateio continua disponível depois de salvar. Um ativo existente continua
  herdando o rateio da posição mais recente dele;
- duas posições novas que criam a mesma instituição, conta ou ativo no mesmo
  salvamento criam o cadastro uma vez; o mesmo ativo novo com dados
  diferentes recusa o salvamento;
- desfazer remove os cadastros criados somente se ninguém mais os usa; a
  fotografia da competência não os inclui;
- validação no servidor: o Zod da ação confere formatos, tamanhos (60
  caracteres para instituição e conta, 80 para ativo e classificações), tipos
  e datas; o domínio confere duplicados, ticker por tipo, vencimento real
  entre 2000 e 2100 e só nos tipos que o admitem, classificações, token,
  cotação maior que zero e conflito de provedor;
- sem novas dependências; o campo de data é o nativo do navegador, no tema
  escuro pelo `color-scheme`.

## Fora do escopo

- renomear, editar ou apagar instituições, contas e ativos existentes;
- editar o vencimento depois de criado e preencher o de ativos importados;
- buscar nos provedores a cotação histórica de uma competência passada;
- classificar automaticamente FII como "Imobiliário BR"; o rateio inicial é
  "Ações BR" e o usuário troca a subclasse;
- Previdência.

## Critérios de aceite

- "Adicionar posição" aparece no topo com o estilo principal e, fora do modo
  de edição, entra em edição com a confirmação de histórico quando a
  competência é passada;
- instituição, conta e ativo aceitam valores novos, sem duplicar existentes;
- o tipo do ativo novo decide ticker, provedor, moeda base e rateio inicial;
- o ticker é conferido no provedor do tipo, com os estados verificando,
  encontrado, não encontrado e indisponível;
- não encontrado bloqueia; indisponível exige a cotação digitada;
- salvar cria tudo na mesma transação, com cotação do mês, cotação do dia
  quando encontrada e rateio; desfazer remove o que foi criado;
- renda fixa aceita vencimento opcional, mostrado na tabela com aviso de
  vencido ou vencendo;
- lint, tipos, build e testes de interface passam.

## Verificação

Num banco descartável (`my_portifolio_s026`), criado pelas migrações e
carregado com a importação e as normalizações do Excel, um roteiro com os
provedores substituídos por respostas simuladas passou nas 44 conferências,
entre elas:

- checagem: ETH encontrado na busca da CoinGecko pela maior capitalização,
  com o nome Ethereum; ZZZ não encontrado e sem token; Finnhub com preço zero
  como não encontrado; QQQ a US$ 500 convertido pelo câmbio simulado para
  R$ 2.550; erro de rede e chave ausente como indisponível com token;
  BOVA11 com o sufixo `.SAO`; "Global Quote" vazio como não encontrado e o
  aviso de limite do Alpha Vantage como indisponível; VOO já cotado sem
  consultar provedor; BTC como ETF em conflito sem nenhuma chamada; USD
  recusado como ticker de cripto;
- a atualização de cotações resolveu ETH pela busca e marcou ZZZ como não
  encontrado;
- em setembro, competência passada: ETH encontrado sem cotação digitada foi
  recusado sem alterar nada; com R$ 12.000,50 digitados, a cotação do mês
  ficou com o valor digitado e sem dia, o histórico diário recebeu a cotação
  de hoje, a posição de 2 ETH somou R$ 24.001,00 com rateio Cripto · Altcoin a
  100%, e o desfazer devolveu todas as contagens;
- em outubro, criado pelo clone: instituição "itau", conta "principal" no
  Inter, ativo "ETF - VOO" com VOO, vencimento em cripto, token falso, token
  de outro símbolo, indisponível sem cotação, VOO como cripto e renda fixa sem
  subclasse foram recusados com a mensagem certa;
- um salvamento com seis posições novas criou Nubank uma vez, com uma conta
  Principal usada por duas posições, a conta Corretora no Inter, seis ativos,
  três cotações do mês (ETH a R$ 13.456,78 com o dia, QQQ a R$ 2.550 e FAIL
  digitada a R$ 100, tipo ACAO, sem dia), duas cotações diárias e seis
  rateios; a LCI ficou com a chave `private:nubank:lci-nubank:2027-06-15`, o
  "Vanguard S&P" usou a cotação de VOO existente e o saldo em dólar a do USD;
  o desfazer devolveu todas as contagens e removeu Nubank e Corretora.

Pela interface, num servidor separado ligado ao mesmo banco descartável, com a
checagem real (sem rede para os provedores, a rota respondeu indisponível):
instituição Nubank criada, conta Principal sugerida, "LCI Nubank" como renda
fixa com vencimento em 20/10/2026, IPCA, Curto e R$ 1.000,10; uma segunda
posição escolhendo a Nubank pendente, "Invesco QQQ" como ETF dos EUA,
"Finnhub indisponível" com o botão bloqueado até digitar R$ 2.550, e 2 cotas.
Salvar gravou exatamente isso, com o selo "vence em 18 dias" na tabela, e
"Desfazer" removeu instituição, conta, ativos e a cotação de QQQ. O banco
local do usuário não recebeu nenhuma gravação. Os selos "vencido" e
"vence em Jun/27" foram conferidos no mesmo banco descartável, marcando o
vencimento de dois títulos importados só ali.

Chamadas reais aos provedores não foram verificadas: este ambiente não alcança
a rede deles e não tem as chaves configuradas. A rota real respondeu
"indisponível" com chave ausente no Finnhub e no Alpha Vantage e HTTP 403 na
CoinGecko.

No Playwright, `tests/e2e/new-position-entities.spec.ts` não grava nada e
substitui a checagem de ticker por respostas fixas: botão no topo entrando em
edição; confirmação de histórico em agosto; instituição e conta novas sem
duplicar o Itaú; checagem com uma única consulta depois da digitação,
encontrado com prévia do total, não encontrado bloqueando, indisponível
exigindo a cotação e o sufixo `.SAO`; renda fixa exigindo subclasse e
duração, com o selo na posição pendente, descartada no fim. O cenário de
listas da nova posição em `tests/e2e/styled-pickers.spec.ts` passou a usar
Instituição e Conta e a esperar "Criar" no lugar da lista vazia de ativos.

Foram conferidas capturas no computador e no Pixel 7 do topo com o botão, do
diálogo vazio, da criação de instituição, da lista de tipos, dos estados
encontrado, indisponível e não encontrado, da renda fixa com vencimento, da
confirmação de histórico e dos selos na tabela.

`pnpm lint`, `pnpm typecheck` e `pnpm build` passaram. A suíte completa do
Playwright, no computador e no Pixel 7, teve 107 execuções aprovadas e 3
puladas por regra dos próprios cenários: a estratégia da tabela no celular e
os dois gestos de toque no computador. Depois dela, o banco local do usuário
seguia com os mesmos 62 ativos, 12 instituições e 12 contas.

## Questões em aberto

- editar o vencimento de um ativo depois de criado, e se os ativos importados
  devem receber vencimento, ficam para a página da posição da spec 016 ou
  para uma decisão do usuário;
- a busca da CoinGecko escolhe a moeda de maior capitalização com o símbolo
  digitado; o usuário prefere confirmar a moeda numa lista quando houver mais
  de uma?
- os 30 dias para "vencendo" e a moeda base USD para criptos que não são o
  bitcoin são escolhas do agente e aguardam confirmação;
- o token da checagem dura duas horas e não sobrevive a um reinício do
  servidor; uma posição pendente por mais tempo precisa ser incluída de novo.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: edição](017-positions-editing.md)
- [Modo de edição com lápis](019-pencil-edit-mode.md)
- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Virada de mês automática](021-automatic-month-rollover.md)
- [Página de cotações em Posições](022-quotes-page.md)
- [Listas de seleção estilizadas](025-styled-pickers.md)
- [Análise do VBA](../context/vba-analysis.md)
