# 048 — Metas padrão, cotações em Posições e abas com cadeado

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03, depois das specs 043 a 047:

- "O botão de cotação está no header principal da aplicação, mude ele de
  lugar! Coloque-o dentro da página da posição geral do mês, não do ativo, aí
  fica coerente o swipe já que aponta posição → cotação";
- metas: ele estava sem metas na tela. "Deixar uma meta de configuração
  default bem padrão, até mesmo quando o usuário acessar ele já ter essa
  página de metas configurada, aí se por ventura ele modificar aí altera no
  banco, p sair junto com as configs"; "se você tiver meus dados de metas
  deveria estar aparecendo a tabela; se não tiver, use como default as
  configs mesmo, depois eu ajusto as metas se baseando no meu Excel";
- "Deixe a aba ativo e rateio bloqueado com cadeado enquanto o usuário não
  preencher o tipo de ativo".

## Diagnóstico das metas

As metas dele estão no banco local: 3 versões e 118 metas, com a vigente
"Metas editadas em 03/10/2026, 04:24". A tela mostrava "sem metas" porque a
migração da [spec 047](047-json-only-data.md) ainda não tinha sido aplicada:
a leitura de `data_imports` falhava e `getTargetEditor` tratava qualquer erro
como ausência de metas. Agora o erro aparece com o motivo.

## Comportamento

### Cotações do mês

O botão "Cotações" sai do topo e fica só no cabeçalho de Posições, ao lado de
"Adicionar posição", em todas as larguras. Leva às cotações da competência
selecionada; a ilha do topo ([spec 046](046-run-history-and-nav-island.md))
mostra o caminho Posições → Cotações. Substitui o ícone do topo da
[spec 034](034-open-closed-months.md).

### Metas padrão

- sem plano de metas ativo, o aplicativo cria o plano "Metas padrão" com as
  categorias da competência mais recente: classes, moedas e estratégias
  presentes, moeda dentro de cada classe, renda fixa por subclasse e resgate e
  renda variável por subclasse. Cada grupo é dividido em partes iguais, em
  pontos inteiros, somando exatamente 100%; o ponto que sobra vai para as
  categorias de maior valor. Tolerância de 2 pontos. Não é recomendação de
  alocação: é o ponto de partida para o usuário ajustar
  (`src/modules/portfolio/domain/default-targets.ts`);
- é criado na checagem de abertura (com o aviso "Metas padrão criadas" e o
  recarregamento da tela), ao abrir a Configuração e depois de restaurar um
  backup sem metas (`ensureDefaultTargetPlan`, em `target-plan-editing.ts`).
  Um bloqueio consultivo (`DEFAULT_TARGETS_LOCK_KEY`) evita dois planos; a
  restauração também o segura;
- sem posições, nada é criado, e a Configuração convida a restaurar um backup
  ou incluir posições;
- editar as metas cria uma versão nova, como qualquer salvamento; as metas
  saem no backup como os demais dados;
- uma falha ao ler as metas mostra "Não foi possível ler as metas." com o
  motivo, em vez do estado vazio.

### Formulário

Na inclusão, as abas Ativo e Rateio ficam desabilitadas, com cadeado e a dica
"Escolha o tipo do ativo na aba Geral para liberar.", até o tipo ser
escolhido. Na edição o tipo já existe, e as abas ficam livres.

## Testes

- `tests/e2e/position-form.spec.ts`: abas com cadeado sem o tipo e liberadas
  depois dele;
- `tests/e2e/quotes-page.spec.ts`: o botão de Posições abre as cotações e o
  topo não tem mais o link;
- `tests/e2e/support/quote-checks.ts`: a resposta da checagem de abertura
  ganhou `targetPlan`.

## Verificação

- schema de teste `metas`: restauração de uma cópia do backup sem metas pelo
  `pnpm backup:restore` criou "Metas padrão" (32 metas, cada grupo com 100%) e
  registrou a importação; abrir o aplicativo sem metas mostrou o aviso e a
  Configuração com o plano; abrir a Configuração direto, sem metas, já trouxe
  o plano no primeiro carregamento; seis pedidos simultâneos criaram um plano
  só; com `data_imports` renomeada, a tela mostrou o motivo do erro. O schema
  foi apagado depois;
- `pnpm check`, `pnpm build` e o Playwright contra o servidor do schema
  `teste`: 162 passaram, 12 pulados.

## Referências

- [Configuração da carteira](014-target-settings.md)
- [Fim da importação do Excel](047-json-only-data.md)
- [Formato do backup](../../docs/backup-format.md)
