# 033 — Escolha da moeda da CoinGecko na inclusão de cripto

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Na inclusão de um cripto novo ([spec 026](026-new-position-entities.md)), a
busca da CoinGecko escolhia sozinha a moeda de maior capitalização entre as
que têm o símbolo digitado. Em 2026-10-02 o usuário preferiu escolher numa
lista quando houver mais de uma. Exemplo real conferido no mesmo dia: PEPE tem
4 moedas com esse símbolo, e TRUMP tem 2.

## Comportamento

- a conferência do ticker de um cripto sem moeda guardada devolve, além da
  moeda escolhida, as candidatas com exatamente o símbolo digitado, da maior
  para a menor capitalização;
- com mais de uma candidata, o diálogo mostra a lista "Moeda na CoinGecko",
  já na de maior capitalização. Escolher outra confere de novo o ticker com a
  moeda escolhida (`coinId` na rota `/api/quotes/ticker-check`), e o preço e
  o nome mostrados passam a ser os dela;
- o servidor só aceita uma moeda que esteja entre as candidatas da busca; o
  token da conferência guarda a moeda, e o ativo novo a recebe em
  `assets.quote_provider_id` ao salvar;
- um símbolo cuja moeda já está guardada num ativo da carteira não oferece
  escolha: a cotação é do símbolo, e o símbolo tem uma moeda só. BTC e SOL
  têm moeda fixa;
- cada moeda escolhida tem a própria entrada no cache da conferência.

## Fora do escopo

Um cripto incluído com a CoinGecko fora do ar continua sem moeda conferida e
é resolvido pela busca a cada atualização, como o usuário decidiu em
2026-10-02.

## Verificação

- `tests/e2e/new-position-entities.spec.ts`: com UNI simulado com duas
  moedas, a lista aparece em Uniswap, escolher Unicorn Token envia `coinId` e
  mostra o nome e o preço da escolhida;
- busca real, só leitura: PEPE com 4 candidatas (Pepe, Based Pepe, Pepe on
  SOL...), TRUMP com 2 e UNI com 1, que não mostra a lista;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Inclusão de posição com conta, instituição, ativo e vencimento novos](026-new-position-entities.md)
