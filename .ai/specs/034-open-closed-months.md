# 034 — Mês aberto ou fechado na linha do tempo

Estado: concluída em 2026-10-02. Em 2026-10-03, o ícone de cotações do topo
foi para o cabeçalho de Posições na
[spec 048](048-default-targets-and-quotes-button.md).
Definida em: 2026-10-02

## Problema

Pedidos do usuário em 2026-10-02 (terceira rodada), registrados em
[Reestruturação da UX](../context/ux-restructure.md):

- remover as setas de mês anterior e próximo e o botão "Mais recente"; no
  lugar dele, mostrar "Fechado" com um cadeado ou "Aberto" com o cadeado aberto
  e o botão "Fechar mês";
- remover o selo "Mês de ano · Rascunho" dos cabeçalhos;
- "editar posições só fica disponível se nós abrirmos o mês de novo";
- a execução antiga de "Atualizar carteira" pode sair do histórico; a criação
  do mês deve ser checada sempre: na atualização automática de hora em hora,
  ao abrir o aplicativo e ao clicar em atualizar;
- o botão "Cotações" de Posições vira um ícone ao lado da última atualização,
  para Posições ficar menos densa.

## Comportamento

- **Aberto e fechado**: aberto é o status rascunho (`DRAFT`); fechado é
  qualquer outro (`IMPORTED`, da planilha, ou `REVIEWED`, fechado pelo
  usuário). Substitui o "finalizar" da [spec 032](032-finalize-current-month.md)
  e a confirmação de histórico das specs 017 e 019;
- **Cadeado na linha do tempo**: à direita da faixa, o mês selecionado mostra
  "Aberto" com o cadeado aberto e o botão "Fechar mês", que fecha sem
  confirmação (não pode haver edição pendente), ou "Fechado" com o cadeado,
  que abre o mês depois de uma confirmação. Qualquer mês pode ser aberto, inclusive
  os importados. No celular, só o botão aparece;
- **Edição só no mês aberto**: "Editar posições", "Adicionar posição" e
  "Editar cotações" só aparecem com o mês aberto, sem confirmações extras. Num
  mês fechado, um aviso diz para abrir o mês pelo cadeado. O servidor recusa
  qualquer edição num mês fechado (`assertEditable`), e a ação
  `setMonthOpenAction` abre ou fecha;
- **Virada de mês**: ao criar a competência do mês corrente, os meses
  anteriores ainda abertos são fechados, mantendo a regra de que meses passados
  pedem um passo a mais para editar. A virada roda ao abrir o aplicativo, ao
  voltar para a aba depois de uma hora, a cada hora com o aplicativo aberto
  (o cliente tenta a cada 5 minutos, e a checagem só chama o servidor de hora
  em hora) e no botão de atualizar cotações;
- **Linha do tempo**: sem setas e sem "Mais recente". As setas do teclado
  continuam trocando de mês;
- **Cabeçalhos**: sem o selo do mês em Visão Geral, Posições, Cotações e
  página da posição; o mês selecionado aparece só na linha do tempo;
- **Cotações**: ícone ao lado do horário da última atualização, a partir de
  640 px. No celular não cabe no topo sem cortar as abas (a 320 px a sobra é
  zero), e o ícone fica no cabeçalho de Posições;
- **Histórico de execuções**: sem as execuções antigas de "Atualizar
  carteira", que continuam guardadas em `monthly_update_runs`.

## Decisões tomadas

- fechar não pede confirmação porque é seguro e reversível; abrir pede, porque
  libera a edição do histórico;
- os meses anteriores são fechados na virada, como o usuário pediu na rodada
  anterior ("os antigos para edição como você já faz");
- a atualização de cotações continua reprecificando o mês corrente fechado.

## Verificação

- navegador: em 1.280 px a faixa fica centralizada, com "Aberto · Fechar mês"
  à direita e o ícone de cotações no topo; em 390 px, o botão "Fechar mês" com
  o cadeado aberto e o ícone de cotações no cabeçalho de Posições;
- testes: o cadeado mostra Set/26 fechado sem "Editar posições", e abrir pede
  confirmação; o teclado troca de mês sem setas na tela; Ago/26 fechado não
  oferece adicionar posição; o ícone abre as cotações do mês;
- o roteiro descartável da spec 026 abre setembro antes de editá-lo;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Linha do tempo compacta](023-compact-month-timeline.md)
- [Finalizar o mês corrente](032-finalize-current-month.md)
