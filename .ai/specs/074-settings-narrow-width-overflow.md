# 074 — Configuração sem rolagem horizontal em telas estreitas

Estado: implementada e validada em 2026-10-05; na `dev`, ainda fora da produção.
Origem: relato do usuário em 2026-10-05: em `/configuracao` com 390 px de largura,
`document.documentElement.scrollWidth` passava 32 px de `window.innerWidth`; os
sufixos "%" dos campos de percentual saíam da borda e o contêiner `space-y-6`
da página media 422 px. A revisão do iPhone ([spec 062](062-iphone-mobile-review.md))
só conferiu 430 px.

## Causa observada

- Abaixo de `xl`, o editor de metas é uma grade de uma coluna sem
  `grid-template-columns`. A trilha implícita é `auto` e cresce até o maior
  mínimo de conteúdo dos itens.
- O painel da prévia (`aside`) tem uma tabela com `min-w-[360px]`, mais o
  preenchimento do painel: 402 px de mínimo de conteúdo, medidos nos itens da
  grade (as seções das metas somavam entre 138 e 312 px).
- O `overflow-x-auto` da tabela não corta esse mínimo: o mínimo automático só
  deixa de valer para itens de grade com `min-width: 0`, e o item é o `aside`
  inteiro, não o contêiner que rola. A coluna passava a ter 402 px (422 px com a
  margem da página) e arrastava as seções das metas, os campos e os sufixos "%"
  para fora da tela. O transbordo era igual de 320 a 430 px, porque dependia do
  mínimo da tabela e não da largura da tela.

## Decisões

- A coluna única abaixo de `xl` passa a ser `grid-cols-1`
  (`minmax(0, 1fr)`): o conteúdo se ajusta à tela, e o que for largo rola dentro
  do próprio painel. Do `xl` em diante a grade é a mesma de antes.
- Com a coluna na largura certa, dois blocos que só cabiam por causa do
  transbordo ficaram apertados e foram refeitos para o celular, sem mudar o
  comportamento das metas:
  - **Matriz de renda fixa** (subclasse × resgate): em 320 px os campos ficavam
    com cerca de 28 px e cortavam o número, e a coluna Total saía da tela. Abaixo
    de `sm` cada subclasse vira um bloco, com o nome e o total em cima e os três
    campos (Curto, Médio e Longo, com o rótulo em cima de cada um) embaixo. Do
    `sm` em diante continua a tabela, idêntica à anterior (conferido em 768 e
    1280 px).
  - **Tabela da prévia** (comprar e vender): saiu o `min-w-[360px]`; os valores
    em reais e os percentuais não quebram linha (o "-" do valor negativo ficava
    sozinho na linha de cima) e o espaço entre as colunas diminui só no
    celular. Cabe de 320 a 430 px, nos seis recortes da prévia, também com metas
    editadas (valor antigo riscado ao lado do novo).
- A faixa de competências e a navegação mantêm a rolagem própria, que é
  intencional (spec 046).

## Verificação

- `tests/e2e/settings-horizontal-overflow.spec.ts`, nos perfis `desktop-chrome`
  e `mobile-safari`, sobre os dados reais, sem salvar (`stubQuoteChecks`):
  - em `/configuracao?mes=2026-09`, com 320, 360, 375, 390, 414 e 430 px,
    `scrollWidth` não passa de `innerWidth`; a falha lista os elementos que
    passam da borda;
  - a matriz de renda fixa e a tabela da prévia não usam rolagem própria
    nessas larguras;
  - com duas metas editadas (os grupos deixam de somar 100%) em 320 e 390 px,
    percorrendo os seis recortes da prévia, a página e as tabelas continuam
    cabendo; o cenário descarta o rascunho.
- Antes da correção, o teste falhou nos dois perfis com `scrollWidth` 422 em
  320 px; depois, os dois cenários passam.
- Sem regressão: `pnpm check`, e as suítes `target-settings-adjustments`,
  `iphone-mobile-review` e `backup` nos dois perfis (29 aprovados, 14 pulados
  pelo perfil ou por falta de mês aberto).
- Medição no Chromium e no WebKit emulados; o iPhone físico segue como na
  spec 062.
