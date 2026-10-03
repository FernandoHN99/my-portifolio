# 052 — Backup por usuário no novo modelo

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03: "Após finalizar tudo, mapeie as saídas dos
arquivos de importação e exportação para o novo modelo que o Prisma utiliza!
Primeiro teste tudo localmente para depois fazer o deploy".

Com o login e os dados por usuário ([spec 050](050-login-and-user-data.md)) e
as cotações compartilhadas ([spec 051](051-shared-automatic-quotes.md)), o
backup da [spec 042](042-data-backup.md), que exportava e restaurava o banco
inteiro, deixou de servir: restaurar apagaria os dados e as cotações de todos.

## Comportamento

- **Exportar** gera a carteira do usuário que entrou: as tabelas da carteira
  sem o `userId`, as cotações que ele digitou e, das compartilhadas, só as dos
  símbolos dos ativos dele, das que ele digitou e do dólar. As execuções da
  atualização, que são de todos, ficam fora;
- **Restaurar** apaga só os dados do usuário e grava os do arquivo nele; as
  cotações compartilhadas só ganham as linhas que faltam no mês ou no dia, sem
  apagar nem sobrescrever as de outros usuários;
- os ids do arquivo voltam iguais, mantendo os endereços das posições; um id
  que outro usuário já usa, como ao restaurar o mesmo arquivo em duas contas,
  ganha um id novo, e as referências a ele acompanham;
- o resumo da restauração compara o arquivo com os dados do usuário e, das
  compartilhadas, com as dos símbolos dele;
- o formato passa à versão 4, com a conversão das versões 1 a 3
  ([Formato do backup](../../docs/backup-format.md));
- pelo terminal, `pnpm backup:export --user <e-mail>` e
  `pnpm backup:restore --user <e-mail> <arquivo> --apply`.

## Critérios de aceite

- um backup da versão 2 restaura num usuário e exporta na versão 4;
- o mesmo arquivo restaura em dois usuários, cada um com os próprios dados, e
  as cotações compartilhadas não duplicam;
- a ida e volta de um backup da versão 4 é exata, com os mesmos ids;
- o arquivo não traz `userId` nem as execuções da atualização.

## Verificação

Em 2026-10-03, num schema de teste com os usuários A e B:

- o backup `meu-portfolio-backup-2026-10-03-2016.json` (versão 2) foi
  restaurado em A e em B: cada um ficou com 41 competências e 457 posições, as
  cotações compartilhadas ficaram em 216 mensais e 312 diárias, sem duplicar, e
  nenhuma posição de B ficou com id de A;
- a cotação digitada por A e as exportações dos dois seguem a
  [spec 051](051-shared-automatic-quotes.md): o arquivo de A saiu na versão 4,
  com 12 tabelas, a cotação digitada e sem `userId`; o de B, sem ela;
- exportar A, restaurar o arquivo em A e exportar de novo deu as mesmas linhas
  em todas as tabelas, com os mesmos ids; das compartilhadas, compara-se sem o
  id e a criação, que a restauração não grava;
- um arquivo da versão 3 (exportado na spec 049) restaurou em B;
- no banco local, os testes de interface (`tests/e2e/backup.spec.ts`) conferem
  a versão 4, `manualQuotes`, a ausência das execuções e do `userId`.

## Referências

- [Formato do backup](../../docs/backup-format.md)
- [Backup dos dados](042-data-backup.md)
