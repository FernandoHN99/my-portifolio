# 040 — Inclusão pelo tipo, nome livre, renomear ativo, sem conta, e cor da diferença

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03 (quarta e quinta rodadas), registrados em
[Reestruturação da UX](../context/ux-restructure.md):

- a conta "Principal" que aparecia com a instituição não é usada e pode sair;
- permitir mudar o nome do ativo;
- o nome do ativo na inclusão deve ser texto livre, e não lista de escolha;
- na inclusão, perguntar primeiro o tipo (ETF dos EUA, Ação dos EUA, ETF da
  B3, Ação ou FII da B3, Cripto, Renda fixa, Caixa em reais, Saldo em dólar) e
  só então mostrar os campos daquele tipo;
- em "Comprar e vender", a diferença negativa em vermelho e a positiva em
  verde, invertendo a cor do texto e mantendo os selos Comprar e Vender.

## Comportamento

- **Inclusão**: o diálogo começa só com "Tipo do ativo". Escolhido o tipo,
  aparecem instituição, ticker (nos tipos cotados) com a conferência, a moeda
  da CoinGecko quando houver várias, "Nome do ativo" em texto livre, o
  vencimento (nos tipos que o aceitam), a seção "Novo ativo" (cotação digitada,
  liquidez e rateio inicial), a quantidade ou o saldo e a estratégia;
- **Ativo existente reaproveitado**: com tipo, ticker, instituição (nos ativos
  sem ticker) e vencimento, o nome forma a chave do ativo. Se ela coincide com
  um ativo existente, ou com o ativo novo de outra posição pendente, a
  inclusão usa esse ativo, com o rateio da posição mais recente dele, em vez de
  recusar como antes. O vencimento fica fora da seção "Novo ativo" porque faz
  parte da identidade: com ele, um título de mesmo nome e outro prazo é novo;
- **Conta fora da interface**: a inclusão usa a conta "Principal" da
  instituição, ou a primeira, e cria "Principal" numa instituição nova. A
  tabela de Posições e a página da posição mostram só a instituição. A conta
  continua no banco como parte da identidade da posição;
- **Renomear o ativo**: lápis ao lado do nome na página da posição
  (`saveAssetNameAction`). A chave acompanha o nome novo, mantendo ticker,
  instituição e vencimento, e não pode coincidir com a de outro ativo;
- **Cor da diferença**: em "Comprar e vender", a diferença positiva (acima do
  ideal) fica em verde e a negativa em vermelho, com a barra ao lado na mesma
  cor; os selos Comprar e Vender não mudaram.

## Verificação

- servidor: renomear Porquinho e ETF - VOO com " Teste" e voltar devolveu nomes
  e chaves originais (`private:inter:porquinho`, `market:etf-voo:VOO`);
- testes: o tipo vem primeiro e a conta não aparece; Time Deposit sem
  vencimento reaproveita o existente, e com vencimento é novo e reaproveitado
  na segunda posição; LCI BRB é reaproveitada no Inter e nova no Itaú; o lápis
  de renomear abre e cancela; a suíte inteira passou (145 testes, 9 pulados por
  depender de meses abertos nos dados reais);
- `pnpm check` e `pnpm build`.

## Referências

- [Inclusão de posição](026-new-position-entities.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
