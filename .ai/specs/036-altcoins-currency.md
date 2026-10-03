# 036 — Altcoins como moeda base

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Resposta do usuário em 2026-10-02 (terceira rodada), registrada em
[Reestruturação da UX](../context/ux-restructure.md): "o que não for BTC você
coloca como altcoins! assim podemos ter diversas moedas, como EUR, USD, BRL,
Altcoins e BTC; além, por exemplo, se tiver um ativo base em EUR será
considerado euro". Antes, as criptos que não são o BTC contavam como dólar.

## Comportamento

- a moeda base de um cripto novo que não seja o BTC é "Altcoins"
  (`baseCurrencyOf` e `ALTCOINS`, em `asset-kinds.ts`);
- a migração `20261003000000_altcoins_base_currency` passou para Altcoins os
  ativos cotados pela CoinGecko que não são o BTC, e as cotações deles. Nos
  dados atuais, só a Solana (SOL). Ativos antigos de cripto com ticker USD, como
  "Etherium" e o "Solana" antigo da planilha, ficam como estão até o
  [passo pré-produção](../context/pre-deploy.md);
- a mesma migração criou a versão "Altcoins separadas do dólar" do plano de
  metas: os 7% de "Cripto · USD", que na prática eram das altcoins, passaram
  para "Cripto · Altcoins", e "Altcoins" entrou com 0% na moeda geral, para o
  usuário ajustar na configuração. A versão importada da planilha não mudou;
  "Restaurar padrão do Excel" devolve as categorias novas a 0%;
- a moeda é a moeda base do ativo; um ativo com base em EUR aparece como EUR,
  com cor própria nos gráficos. Cadastrar ativos em euro depende de um tipo
  de ativo e de uma cotação do euro, que ainda não existem.

## Verificação

- banco: Solana com base Altcoins; plano ativo com 40 metas, Cripto · Altcoins
  em 7%, Cripto · USD em 0% e Altcoins em 0% na moeda geral;
- navegador: a Solana mostra Altcoins na coluna de moeda de Posições, e a
  Visão Geral lista Altcoins;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Inclusão de posição](026-new-position-entities.md)
- [Configuração da carteira](014-target-settings.md)
