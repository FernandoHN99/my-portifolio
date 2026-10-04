# 068 — Classificação fixa da planilha e tipo do ativo

Estado: implementada e validada localmente em 2026-10-05. Sem commit ou deploy.
Origem: pedidos do usuário em 2026-10-04:

- a subclasse não pode aceitar qualquer valor: devem valer os da planilha,
  porque as metas e o comprar e vender agrupam por eles;
- a informação como "Tesouro Direto" deve ir para uma coluna nova, para uma visão
  macro da carteira (X% em Tesouro Direto, Y% em ETF americano);
- as listas devem ser dependentes entre si: na classe Cripto, só BTC, Altcoin e
  Stablecoin.

O usuário aprovou a lista abaixo ("Assim mesmo") na mesma conversa.

## Classificação fixa

| Classe | Subclasses | Resgate |
|---|---|---|
| Caixa | Pós-fixado, Stablecoin | Curto |
| Cripto | BTC, Altcoin, Stablecoin | Nenhum |
| Renda Fixa | Pós-fixado, IPCA | Curto, Médio, Longo |
| Renda Variável | Ações EUA, Ações - Ex: USA, Ações BR, Imobiliário BR, Commoditie | Nenhum |
| Reserva | Commoditie | Nenhum |

- A fonte é `src/modules/portfolio/domain/classification.ts`.
- São os valores da tabela `Table_Investimentos_Porcent` da planilha e das metas
  do backup; todos os rateios atuais já estão nessa lista.
- No rateio do formulário, a subclasse e o resgate mostram só os da classe
  escolhida. Trocar a classe limpa o que não vale nela e escolhe sozinho a
  opção única, como o resgate Curto do caixa. Não há mais "Usar valor novo".
- O servidor confere a classificação (`classificationIssue`). Uma classificação
  antiga fora da lista só continua aceita se a posição editada já a tinha, para
  mudar outros atributos sem reclassificar o passado.
- O Tesouro Direto deixa de usar a subclasse "Tesouro Direto": Selic vira
  Pós-fixado, e IPCA+, Renda+ e Educa+ viram IPCA.
  - O prefixado fica sem subclasse até o usuário escolher, porque a planilha não
    tem uma.
  - Stablecoins incluídas como cripto entram como Stablecoin.
- Substitui a lista aberta de subclasses da
  [spec 035](035-redemption-and-known-classes.md).

## Tipo do ativo

- Coluna opcional `assets.asset_type` com as chaves de `ASSET_TYPES`: os nove
  tipos da inclusão (ETF dos EUA, Ação dos EUA, ETF da B3, Ação ou FII da B3,
  Cripto, Tesouro Direto, Renda fixa, Caixa em reais, Caixa em dólar) mais
  Previdência.
- A inclusão grava o tipo escolhido. O lápis do ativo deixa escolher numa lista
  fixa, com desfazer, valendo para todos os meses.
- Ativos antigos, ainda sem tipo, têm o tipo deduzido na leitura
  (`assetTypeOf`) por símbolo, moeda e nome: "Tesouro", "Previd", contas e
  cofrinhos. Nada é gravado sem o usuário.
- Em Posições:
  - coluna Tipo em telas largas; nas demais, o tipo aparece sob o nome do ativo;
  - filtro Tipo, em cascata depois da subclasse;
  - agrupamento por Tipo.
- Na Visão geral, o painel "Tipo de ativo" mostra a participação de cada tipo no
  patrimônio da competência, sem meta. As metas continuam pela classificação.
- No backup, o campo é opcional (`assetType`): arquivos antigos restauram como
  antes, e o formato continua na versão 5 ([formato](../../docs/backup-format.md)).

## Verificação

Em 2026-10-05:

- `pnpm check` aprovado.
- `tests/e2e/styled-pickers.spec.ts`:
  - a classe oferece só as cinco da lista;
  - Cripto oferece BTC, Altcoin e Stablecoin;
  - Renda Fixa oferece Pós-fixado e IPCA, com resgate curto, médio e longo;
  - Caixa já escolhe o resgate Curto;
  - nada de "Usar".
- `tests/e2e/types-and-dates.spec.ts`: painel por tipo na Visão geral, filtro
  `tipo=ETF dos EUA` e agrupamento por tipo.
- `tests/e2e/position-form.spec.ts`: o lápis mostra o tipo "Cripto" do Bitcoin 01
  numa lista.
- Na carteira local de out/2026, o painel mostrou oito tipos, somando 100%, com
  o tipo deduzido dos ativos antigos; os valores ficam fora do repositório,
  que é público.

## Arquivos

- `src/modules/portfolio/domain/classification.ts`
- `src/modules/portfolio/application/month-editing.ts` (`assertAllocationRules`)
- `src/modules/portfolio/application/asset-attributes.ts` (`assetType`)
- `src/modules/portfolio/presentation/position-filters.ts` (`typeOf`, filtro `types`)
- `src/modules/portfolio/ui/asset-type-breakdown.tsx`, `positions-workspace.tsx`,
  `position-form-dialog.tsx`, `edit-dialogs.tsx`
