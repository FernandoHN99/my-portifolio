# 055 — Carteira vazia: incluir a primeira posição ou restaurar um backup

Estado: concluída localmente em 2026-10-04 (sem deploy).
Definida em: 2026-10-04

## Problema

Pedido do usuário em 2026-10-04: "Quando não houver nenhuma posição (usuário
novo), já deixar a opção de adicionar posição logo na tela inicial, ou aparece
o botão de 'Restaurar backup'".

Um usuário novo via "Sua carteira ainda não tem posições", com o texto antigo
sobre importar do Excel, e Posições dizia "Nenhuma posição nesta competência",
sem ação. Pior: sem nenhuma competência, ele não tinha como incluir a primeira
posição, porque a virada de mês só copia a competência anterior
([spec 021](021-automatic-month-rollover.md)).

## Comportamento

- **primeira competência**: a checagem de abertura cria, para quem não tem
  competência nenhuma, a do mês corrente, vazia e aberta (estado `started` da
  virada de mês, sem aviso). Restaurar um backup depois troca tudo, como
  sempre;
- **Visão Geral vazia** ("Sua carteira está vazia"): "Adicionar posição" leva a
  Posições com o formulário aberto (`/posicoes?incluir=1`) e "Restaurar backup"
  leva ao painel de backup da Configuração (`/configuracao#backup`);
- **Posições vazia** ("Nenhuma posição ainda"): os mesmos dois botões; incluir
  abre o formulário ali mesmo. Se a competência ainda não existir (a página
  aberta antes da checagem), o botão a cria (`startPortfolioAction`) e abre o
  formulário em seguida. Fechar o formulário tira o `incluir` do endereço;
- um mês fechado sem posições continua só avisando "Nenhuma posição nesta
  competência".

## Verificação

Em 2026-10-04, com um usuário de teste sem dados no banco local
(`vazio@sync.test`):

- ao entrar, a checagem criou Out/26, aberto, e a Visão Geral mostrou "Sua
  carteira está vazia" com os dois botões;
- "Adicionar posição" abriu Posições com o formulário "Adicionar posição" de
  Out/26; cancelar deixou "Nenhuma posição ainda" com os dois botões e o
  endereço sem `incluir`;
- "Restaurar backup" abriu a Configuração no painel "Backup dos dados".

## Referências

- [Virada automática de mês](021-automatic-month-rollover.md)
- [Mês aberto ou fechado](034-open-closed-months.md)
- [Backup por usuário](052-per-user-backup.md)
