# 061 — Tesouro Direto por quantidade e preço oficial

Estado: implementada localmente em 2026-10-04; falta confirmar uma inclusão
gravada com um título real do usuário. Sem deploy.

## Resultado esperado

Selecionar um título por tipo e vencimento exato e acompanhar seu valor de
mercado pela quantidade, usando fonte gratuita oficial com atraso aceitável.
Não inferir dados de aquisição de nomes antigos nem trocar automaticamente
posições manuais existentes para títulos cotados.

Fonte das regras: seção 8 do
[briefing consolidado](../context/position-transactions-prompt.md).

## Fonte e representação

- [Dados abertos do Tesouro Nacional](https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto):
  CSV diário de preços e taxas, sem chave/pagamento. Seu recurso é publicado
  pela API CKAN oficial; catálogo, preço atual e histórico usam a mesma carga.
- [Metadados oficiais](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/1a8eb2e3-4902-4a38-a1eb-6410f23d90de/download/taxa.pdf):
  **PU Base Manhã**, liquidação D0, representa marcação a mercado de posições.
  PU Compra e PU Venda, D+1, não o substituem.
- Identidade inequívoca: tipo oficial + data completa do vencimento;
  `TD:<tipo normalizado>:<AAAA-MM-DD>` é o símbolo interno, sem ticker de bolsa.
  `quoteProviderId` guarda `<tipo oficial>|<AAAA-MM-DD>`; não exige campo novo.
- Quantidade × PU Base produz valor de mercado bruto. Preço executado,
  rentabilidade contratada e dinheiro recebido na liquidação têm seus papéis
  próprios; recebimentos de juros periódicos não são criados automaticamente.
- Cada preço conserva sua data oficial. Buscar no domingo não cria preço
  dominical. Preço antigo não faz a cotação mensal regredir a uma data anterior.
  Em falha, o job registra o erro e preserva os preços/valores já salvos.

## Integração

`domain/treasury.ts` valida CSV, identidade, PU Base, datas e cobertura.
`infrastructure/treasury.ts` lê o recurso com timeout de 30 segundos, uma carga
concorrente e cache de uma hora somente para respostas válidas. Falhas não
ganham preço substituto. `fetchCurrentQuotes` e `loadSymbolHistory` têm ramos
TESOURO próprios, sem Yahoo Finance/Alpha Vantage. O job da spec 053 grava
`quoteDate` informado pelo provedor no histórico diário e na cotação mensal.

`GET /api/quotes/treasury-catalog` exige sessão e devolve os títulos ainda não
vencidos para os quais há preço observado, cada um com tipo, vencimento,
identificador, PU e data. A rota é de leitura, sem gravar carteira/cotações.
O formulário deve usar esse catálogo e conferir a seleção no servidor.

## Cobertura e limites

O suporte é a cobertura efetivamente observada no CSV para cada identidade,
inclusive registros com juros semestrais e títulos históricos fora de oferta.
Não se promete que todo título possuído tenha preço em todos os dias: o
catálogo mostra a data do último PU; um título ausente é recusado; meses sem
preço dentro do intervalo observado fazem o backfill falhar explicitamente.
Não há preços inventados antes do primeiro PU nem após o vencimento. Título
vencido mantém o último valor salvo e pede conferência na liquidação.

O endpoint antigo `treasurybondsinfo.json` respondeu HTTP 410 na pesquisa de
2026-10-04 e não é usado. A carga CSV oficial respondeu HTTP 200 na pesquisa.
Validações contra a resposta integral atual e o formulário estão registradas
abaixo conforme sua conclusão.

## Critérios de aceite

- selecionar tipo e vencimento inequívocos, cadastrar quantidade e cotar pelo PU Base;
- preço atrasado tem data real na tela e no banco, sem dia fictício;
- job e histórico usam a fonte Tesouro e preservam último preço quando falham;
- título ausente, identidade conflitante ou preço inválido são recusados;
- títulos de um mesmo tipo/ano com vencimentos diferentes não se confundem;
- datas e campos opcionais existentes mantêm o backup e isolamento do usuário;
- pagamentos periódicos não criam créditos de caixa sem lançamento do usuário.

## Verificação

Fixtures em `tests/unit/treasury-quotes.test.ts` cobrem PU Base/D0, vencimentos
do mesmo ano, título com juros semestrais, data atrasada, consulta passada,
ausência/conflito/vencimento, falha/recuperação, cache compartilhado, cobertura
histórica incompleta, formato inválido e roteamento sem provedores de bolsa.
Em 2026-10-04, `pnpm exec tsx --test tests/unit/treasury-quotes.test.ts`
passou os **10 cenários**, incluindo o job com cliente simulado: parâmetros
da gravação têm o dia oficial 02/10 ao consultar em 04/10, dados futuros ou
impossíveis são recusados, e a reprecificação usa a cotação mensal aceita.
Os testes não acessam o banco. ESLint dos arquivos alterados e o typecheck
da árvore passaram, também executados com Node 24.20.0.

Uma carga real integral pelo novo provedor processou o CSV oficial sem erro:
**150 séries**, **58 títulos não vencidos** no catálogo na data 04/10/2026;
os exemplos retornados têm PU com data **02/10/2026**. Isso comprova acesso e
formato atuais, sem confirmar que todos os títulos do usuário têm cobertura.

Formulário: o tipo "Tesouro Direto" troca o campo de ticker pelo seletor
"Título do Tesouro" (tipo e vencimento do catálogo oficial); escolher um título
preenche o nome, mostra a data do preço e o vencimento só para leitura, e a
conferência do título usa o símbolo `TD:…`. Em 2026-10-04,
`tests/e2e/position-form.spec.ts` ("o Tesouro Direto é escolhido pelo título e
vencimento oficiais"), com catálogo e conferência simulados e sem salvar,
passou nos perfis desktop-chrome, mobile-chrome e mobile-safari. A API CKAN do
Tesouro Transparente respondeu HTTP 200 nesta máquina no mesmo dia.

Pendente: incluir e salvar uma posição de Tesouro num schema de teste com um
título que o usuário tem, conferir o valor de mercado pela quantidade e a
reprecificação pelo job.
