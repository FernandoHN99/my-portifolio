# 026 — Inclusão de posição com conta, instituição, ativo e vencimento novos

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

A conferência do ticker ao salvar foi atualizada pela
[spec 063](063-ticker-verification-during-save.md): o comprovante assinado
substitui o token guardado na memória do processo.

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
  aparecem nas listas com a marca "nova" ou "novo", e o ativo com vencimento
  traz "novo · vence Mmm/aa"; um ativo novo sem ticker só aparece na
  instituição em que foi criado, porque a identidade dele inclui a
  instituição.

### Ativo novo

- o campo "Ativo" aceita um nome novo, inclusive igual ao de um ativo
  existente: o existente continua primeiro e "Criar “nome”" vem por último;
- um ativo novo com a mesma identidade de um ativo existente ou do ativo novo
  de outra posição pendente mostra o aviso no próprio bloco, como
  `O ativo "LCI BRB" já existe nesta instituição. Escolha-o na lista ou
  informe um vencimento.`, e "Adicionar" fica bloqueado; assim um repetido não
  chega ao salvamento, que recusaria todas as alterações pendentes;
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
- na B3 o ticker só é conferido completo, com quatro caracteres e um ou dois
  dígitos, como PETR4, B3SA3 ou GPCA11; com "PETR" a meio da digitação, o
  diálogo pede "Digite o ticker completo, como PETR4 ou GPCA11." e não
  consulta o provedor;
- o servidor reaproveita a resposta do provedor para o mesmo símbolo por duas
  horas, no mesmo dia: digitar de novo, trocar entre ETF e ação da B3 ou
  conferir outra posição com o mesmo ticker não gasta outra consulta;
  "indisponível" não é reaproveitado, para a próxima checagem tentar de novo;
- estados mostrados abaixo do campo:
  - "Verificando VOO no Finnhub…";
  - encontrado: "ETH encontrado (Ethereum) no CoinGecko: R$ 13.456,78 hoje.";
    o nome da moeda aparece quando a busca da CoinGecko a escolheu; um símbolo
    com moeda já guardada num ativo é conferido por ela, sem o nome;
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
- um cripto novo guarda no ativo a moeda da CoinGecko conferida, e a
  atualização de cotações passa a cotá-lo por ela; um símbolo que outro ativo
  já cota mantém a moeda dele;
- o aviso de alterações salvas mantém "Desfazer": ele restaura a competência e
  remove as instituições, contas, ativos e cotações diárias criados que
  ficaram sem uso; a moeda guardada sai junto com o ativo.

### Vencimento na tabela

- abaixo do nome do ativo aparece um selo: "vence em Jun/27"; "vence em 12
  dias", "vence amanhã" ou "vence hoje" em tom de aviso a partir de 30 dias;
  "vencido" em vermelho; a dica traz a data completa;
- o dia de referência é hoje na competência do mês corrente e o último dia do
  mês nas demais, para o histórico não mostrar como vencido um título que
  venceu depois.

## Modelo de dados

Migrações aditivas, sem alterar dados existentes:

- `20261002070219_asset_maturity_date`: coluna `assets.maturity_date`, `DATE`
  nulo;
- `20261002174528_asset_quote_provider_id`: coluna `assets.quote_provider_id`,
  `TEXT` nulo, com a moeda da CoinGecko de um cripto criado pela interface. Os
  ativos importados ficam nulos; BTC e SOL continuam com o identificador fixo
  no código.

`market_quotes.instrument_type` e `daily_quotes.instrument_type` passam a
admitir `ACAO`, além de `ETF`, `FIAT` e `CRIPTO`; a página de cotações mostra
"Ação".

Chave dos ativos novos, no formato da importação: `market:<nome>:<TICKER>`
para ativos com ticker, inclusive o saldo em dólar, de ticker `USD`, e
`private:<instituição>:<nome>` para os demais, com `:<vencimento>` no fim
quando há vencimento, nos dois formatos. Como na importação, um ativo com
ticker não depende da instituição: um "Time Deposit" sem vencimento é o
`market:time-deposit:USD` importado, em qualquer instituição, e um com
vencimento em 15/01/2027 é `market:time-deposit:USD:2027-01-15`.

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
  pontuação. Na interface, digitar o nome de uma instituição ou conta
  existente escolhe a existente, e um ativo novo repetido é avisado no
  diálogo, pela mesma chave do servidor, contra o catálogo e os ativos novos
  pendentes; no servidor, uma instituição, conta ou ativo duplicado recusa o
  salvamento com a indicação de escolher o existente;
- interpretação de "mesma coisa para ativos": o ativo aceita nome novo. Um
  nome igual ao de um ativo existente pode ser criado, porque o vencimento
  passa a diferenciar títulos como "LCI BRB" que antes levavam o prazo no
  nome; o diálogo e o servidor recusam se nome, ticker ou instituição e
  vencimento coincidirem;
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
  errada; BTC e SOL mantêm os identificadores fixos;
- a moeda conferida fica guardada no ativo, em `assets.quote_provider_id`, e
  a atualização de cotações da [spec 020](020-daily-quotes.md) e as checagens
  seguintes do mesmo símbolo usam a moeda guardada. Sem isso, a busca a cada
  atualização poderia passar a cotar outra moeda com o mesmo símbolo quando a
  capitalização mudasse, e cada cripto novo custaria uma busca a mais por
  atualização. A coluna no ativo foi preferida a uma tabela própria de
  símbolos: o ativo já guarda como é cotado (`quote_symbol`), o desfazer que
  remove o ativo leva a moeda junto, e não há mais nada a manter. Como a
  cotação é por símbolo, um segundo ativo do mesmo símbolo herda a moeda do
  primeiro; só a busca, sem moeda guardada, decide uma moeda nova;
- orçamento dos provedores: a resposta do provedor é reaproveitada por
  símbolo durante as duas horas do token, no mesmo dia, e o ticker da B3 só é
  conferido completo. O Alpha Vantage tem 25 consultas gratuitas por dia
  ([spec 003](003-manual-monthly-update.md)), que a atualização diária também
  usa; sem isso, uma pausa na digitação de "PETR4" ou a troca entre ETF e ação
  da B3 gastariam consultas a mais. "Indisponível" não é reaproveitado, para
  quem tentar de novo depois de configurar a chave ver o resultado na hora;
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
  diferentes recusa o salvamento. Pela interface isso não acontece: a segunda
  posição escolhe o ativo novo pendente, porque criar outro igual é avisado
  no diálogo;
- o saldo em dólar usa a chave de mercado, sem a instituição, como os saldos
  importados ("Time Deposit", "USDC"), e o vencimento entra no fim dela. Dois
  "Time Deposit" com vencimentos diferentes são ativos distintos; o mesmo nome
  e vencimento em duas instituições é o mesmo ativo, como acontece com os
  ativos com ticker;
- ao fechar o diálogo, o foco volta ao botão "Adicionar posição" do topo,
  também quando ele abriu pela confirmação de histórico, cujo botão some ao
  entrar em edição;
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
  um ativo novo repetido, existente ou pendente, é avisado no diálogo antes de
  incluir, e o vencimento distingue títulos de mesmo nome, inclusive saldos em
  dólar;
- o tipo do ativo novo decide ticker, provedor, moeda base e rateio inicial;
- o ticker é conferido no provedor do tipo, com os estados verificando,
  encontrado, não encontrado e indisponível;
- não encontrado bloqueia; indisponível exige a cotação digitada;
- salvar cria tudo na mesma transação, com cotação do mês, cotação do dia
  quando encontrada, rateio e, no cripto, a moeda da CoinGecko conferida;
  desfazer remove o que foi criado;
- renda fixa aceita vencimento opcional, mostrado na tabela com aviso de
  vencido ou vencendo;
- lint, tipos, build e testes de interface passam.

## Verificação

Primeira entrega, em 2026-10-02: no banco descartável `my_portifolio_s026`,
um roteiro com os provedores simulados; pela interface, num servidor ligado ao
mesmo banco, instituição Nubank, conta Principal, "LCI Nubank" com vencimento
e "Invesco QQQ" com o Finnhub indisponível e a cotação digitada foram salvos e
desfeitos, com o selo "vence em 18 dias" na tabela; lint, tipos, build e a
suíte do Playwright passaram.

Revisão, em 2026-10-02, depois dos achados sobre o saldo em dólar, os
duplicados, o orçamento do Alpha Vantage, a moeda da CoinGecko, o foco e o
código sem uso. Tudo abaixo foi rodado depois das correções:

- o roteiro virou a conferência `pnpm verify:new-position`
  (`scripts/verify-new-position-entities.ts`, descrita no README), que se
  recusa a rodar sem `VERIFY_DISPOSABLE_DATABASE` igual ao banco de
  `DATABASE_URL`. Num banco `my_portifolio_s026` recriado pelas migrações,
  pela importação e pelas duas normalizações, passou nas 62 conferências, e
  de novo numa segunda execução no mesmo banco. Além das da primeira entrega,
  conferiu: as chaves do saldo em dólar com e sem vencimento; a segunda
  checagem de ETH e a troca entre ETF e ação da B3 sem nova consulta;
  indisponível consultado de novo; "PETR" inválido sem consulta; a moeda
  `ethereum` guardada no ativo, usada pela checagem seguinte mesmo com a busca
  simulada passando a preferir outra moeda, e pedida pela atualização de
  cotações; um segundo ativo de ETH herdando a moeda; "Time Deposit" sem
  vencimento recusado como repetido do importado; dois "Time Deposit" com
  vencimentos diferentes, no Inter e no Nubank, criados como ativos
  distintos; e o desfazer devolvendo todas as contagens;
- pela interface, num servidor na porta 3210 ligado a esse banco, com a
  checagem real (sem rede, a CoinGecko respondeu HTTP 403): "Time Deposit"
  como saldo em dólar no Inter avisou o repetido até receber o vencimento
  15/01/2027; uma segunda posição na instituição nova "Wise Teste" escolheu o
  "Time Deposit" pendente pela opção "novo · vence Jan/27"; "Cardano" com ADA
  ficou indisponível e foi incluído com R$ 3,50 digitados. Salvar criou uma
  instituição, uma conta, dois ativos (`market:time-deposit:USD:2027-01-15`,
  usado pelas duas posições, e `market:cardano:ADA`, sem moeda guardada), três
  posições, três rateios e a cotação de ADA; "Desfazer" devolveu todas as
  contagens. O banco foi apagado depois;
- `tests/e2e/new-position-entities.spec.ts` ganhou cenários, sempre sem
  gravar e com a checagem de ticker substituída: já cotado na competência e
  símbolo de outro provedor; encontrado numa competência passada pedindo a
  cotação do mês; falha da rota com "Tentar de novo"; saldo em dólar repetido
  até receber vencimento, com a segunda posição usando o ativo novo pendente;
  renda fixa de nome existente pedindo vencimento e o título novo aparecendo
  só na instituição dele; ticker incompleto da B3 sem consulta; o foco de
  volta ao botão do topo depois da confirmação de histórico. A consulta única
  depois da digitação não depende mais de atraso entre as teclas;
- capturas no computador e no Pixel 7 do aviso de repetido no saldo em dólar
  e na renda fixa, da opção do ativo novo pendente, das duas linhas pendentes
  com o selo, do ticker incompleto da B3 e do encontrado sem o nome da moeda;
- `pnpm lint` (só o aviso da configuração local do Playwright, que não entra
  no repositório), `pnpm typecheck` e `pnpm build` passaram. A suíte completa
  do Playwright, no computador e no Pixel 7, teve 117 execuções aprovadas e 3
  puladas pelas regras dos próprios cenários. O banco local do usuário seguiu
  com 12 instituições, 12 contas, 62 ativos e 383 posições; nele só mudou o
  esquema, com a coluna nova.

Chamadas reais aos provedores não foram verificadas: este ambiente não alcança
a rede deles e não tem as chaves configuradas.

## Questões em aberto

Respondidas pelo usuário em 2026-10-02 (segunda rodada):

- o vencimento é editável na página da posição
  ([spec 016](016-position-history.md)); os ativos importados não recebem
  vencimento inferido do nome, e o acerto deles fica para o
  [passo pré-produção](../context/pre-deploy.md);
- a moeda da CoinGecko é escolhida numa lista quando há mais de uma com o
  símbolo ([spec 033](033-coingecko-coin-choice.md));
- um cripto incluído com a CoinGecko indisponível continua resolvido pela
  busca a cada atualização;
- o token da checagem de duas horas, que não sobrevive a um reinício, foi
  aceito.

Aguardando explicação ao usuário, que tende a aceitar: os 30 dias para
"vencendo" e o dólar como moeda base das criptos que não são o BTC. "Vencendo"
é o selo amarelo que aparece quando faltam 30 dias ou menos para o vencimento;
antes disso o selo é neutro e, depois, vermelho, "vencido". A moeda base é a
moeda de exposição usada no recorte por moeda da Visão Geral: o BTC conta como
BTC, e as demais criptos contam como dólar.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: edição](017-positions-editing.md)
- [Modo de edição com lápis](019-pencil-edit-mode.md)
- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Virada de mês automática](021-automatic-month-rollover.md)
- [Página de cotações em Posições](022-quotes-page.md)
- [Listas de seleção estilizadas](025-styled-pickers.md)
- [Análise do VBA](../context/vba-analysis.md)
