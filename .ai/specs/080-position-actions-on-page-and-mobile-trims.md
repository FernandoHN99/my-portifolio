# 080 — Ações só na página da posição e ajustes do celular

Estado: concluída e validada localmente em 2026-10-06, na `dev`; sem deploy.
Origem: pedidos do usuário em 2026-10-06.

## Pedidos e decisões

- **Ações da posição:** a tabela de Posições não tem mais a coluna de botões
  (movimentar, liquidar, editar, remover). Tudo fica na página da posição, que
  ganhou o "Remover", com a mesma confirmação (Cancelar, Liquidar, Remover).
  - Depois de remover, a página volta para a tabela do mês, que mostra o aviso
    com o desfazer (`handOffToast`, pelo armazenamento da sessão). Sem o
    registro, a página da posição iria a outro mês e perderia o aviso.
- **Configuração:** a prévia de comprar e vender some abaixo de 768 px.
- **Visão geral:** no celular, comprar e vender mostra só o item e a
  diferença; as colunas de atual e ideal voltam a partir de 640 px.
- **Rendimento automático (spec 079):** nas movimentações, o tipo aparece como
  "Rendimento automático", com filtro próprio; o guardado ao desligar o cálculo
  ou na liquidação também.

## Backup v3

`backups/meu-portfolio-backup-2026-10-05-movimentacoes-v3.json` segue o modelo
atual: versão 5, sem os campos novos, que restauram com o cálculo desligado.
Restaurado e exportado de novo num schema descartável: as tabelas batem, e as
únicas diferenças são zeros à direita nos valores das movimentações.

## Critérios de aceite

- A tabela de Posições não oferece movimentar, liquidar, editar ou remover;
  as ações estão na página da posição e respeitam o mês aberto.
- Remover pede confirmação, oferece Liquidar quando cabível e retorna à
  tabela do mesmo mês com Desfazer, inclusive ao remover a última posição.
- A prévia da Configuração fica oculta abaixo de 768 px; comprar e vender
  da Visão geral mostra só Item e Diferença abaixo de 640 px.
- O rendimento calculado e o guardado ao desligar o cálculo ou liquidar
  mostram Rendimento automático e têm filtro próprio.

## Verificação

- `pnpm check` limpo.
- Validação inicial registrada, antes da revisão pré-commit: 126 aprovados,
  94 pulados e nenhuma falha nas suítes afetadas sobre os dados reais.
- Servidor de teste com a demonstração: tabela sem ações, Remover com
  desfazer na tabela, tipo "Rendimento automático" e filtro, comprar e vender
  com Item e Diferença em 390 px. Falhas restantes lá são de dados (ativos da
  carteira real que não existem na demonstração).
- Testes atualizados para abrir lápis, Movimentar e Remover pela página
  (`openPositionPage`).
- Revisão pré-commit: corrigido o Desfazer ao remover a última posição do
  mês; o teste que abre duas movimentações seguidas reaproveita a página
  da posição, sem tentar procurar a linha da tabela na segunda abertura.
- Revalidação pré-commit com Node 24.20.0: `pnpm check` limpo; oito suítes
  afetadas com 89 aprovados e 85 pulados. A única falha, no clique de um
  gráfico no WebKit antes da hidratação, foi corrigida com `waitForHydration`;
  a repetição do cenário e do login passou (2 aprovados).
- Schema descartável, com uma única posição em outubro e histórico em
  setembro: Chrome desktop e iPhone 16 Plus/WebKit conferiram a remoção,
  a volta à tabela de outubro com Desfazer e a restauração da posição no
  mesmo mês. Nenhuma gravação na carteira real.

## Produção

As specs 079 e 080 continuam na `dev`. O job novo depende das duas migrações
da 079: publicar o app primeiro e republicar `quotesync` depois. A conferência
do Neon e a pendência ficam em [Produção](../context/production.md#pendente).
