# 017 — Posições: edição

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

Separada da spec 013 para manter as fatias pequenas. Parte da tabela com
filtros entregue lá: o usuário filtra um recorte e edita dentro dele.

O usuário registrou em 2026-10-01 que editar posições e metas é necessário,
sem fixar se agora ou depois.

## Problema

A edição vive em uma rota separada, restrita ao rascunho, e só altera
quantidade e saldo. O usuário quer editar qualquer competência com a
facilidade da planilha, e editar deve ser o comportamento natural da aba.

## Escopo

- edição direta na célula, com navegação por teclado;
- a competência mais recente é editada sem cerimônia;
- competências passadas ficam travadas e exigem confirmação explícita, com
  aviso de que o histórico será alterado;
- alterações ficam pendentes e destacadas até salvar ou descartar;
- inclusão e remoção de posição;
- ao salvar, um aviso permite desfazer;
- rateio da posição editado em painel lateral, com validação de soma igual a
  100%;
- criar a competência a partir da anterior, clonando posições e rateios, sem
  depender da busca de cotações;
- painel recolhível com as cotações da competência, editáveis, com recálculo
  dos totais das posições cotadas.

## Mudança de regra

A spec 006 restringiu a edição ao rascunho. O briefing do usuário permite
editar competências passadas mediante confirmação, porque após a importação o
aplicativo é a fonte da verdade. A regra de domínio deve mudar de "somente
rascunho" para "rascunho livre, demais com confirmação explícita".

A rota `/carteira/editar` deixa de ser necessária quando esta fatia existir.

## Critérios de aceite

- editar uma quantidade recalcula o total pela cotação persistida;
- editar um saldo manual atualiza quantidade e total na mesma transação;
- competências passadas só aceitam alteração após confirmação;
- nenhum conjunto inválido é salvo parcialmente;
- o rateio recusa soma diferente de 100%;
- clonar a competência anterior traz posições e rateios;
- alterar uma cotação recalcula as posições daquele símbolo na competência;
- lint, tipos, build e testes de interface passam.

## Decisões tomadas

- a competência mais recente, de maior data, é editada livremente; qualquer
  outra exige confirmação explícita, e o servidor recusa a alteração sem o
  sinal de confirmação, que a interface só envia depois do aceite do usuário;
- as edições de célula ficam pendentes no navegador, com prévia ao vivo dos
  totais e da participação, e são gravadas em uma única transação ao salvar;
- o desfazer usa uma fotografia da competência tomada antes da alteração e
  guardada no servidor por dez minutos; o navegador recebe apenas um token
  opaco. O desfazer só é aplicado se a competência continuar exatamente como
  ficou após a alteração, comparando uma impressão digital do estado, e cada
  token vale uma única vez;
- desfazer recria posições e classificações removidas com o mesmo
  identificador e o mesmo vínculo com a linha do Excel;
- um rateio editado substitui as classificações da posição e perde o vínculo
  com a linha do Excel, porque deixa de representar aquela linha;
- uma posição incluída herda o rateio da posição mais recente do mesmo ativo,
  em qualquer conta; sem histórico, fica sem classificação até ser rateada;
- clonar cria somente o mês seguinte ao mais recente, nunca além do mês
  corrente, copiando posições, rateios e cotações; os rateios copiados não
  mantêm vínculo com o Excel;
- uma competência criada por clonagem pode receber depois a atualização de
  cotações, que passou a registrar a execução para rascunhos sem ela;
- alterar a cotação do dólar atualiza também o câmbio gravado nas posições da
  competência;
- trocar de competência, de aba ou fechar a página com alterações pendentes
  pede confirmação, para não descartar edições em silêncio;
- a rota `/carteira/editar`, o editor anterior e sua regra de edição somente
  em rascunho foram removidos; a spec 006 registra a substituição.

## Limites conhecidos

- incluir posição aceita apenas ativos e contas já existentes; criar um ativo
  novo exige definir símbolo e tipo de cotação, e fica para uma fatia própria;
- na largura de celular a coluna de quantidade fica oculta e a edição direta
  não é oferecida; uma folha de edição para celular pode ser especificada
  depois;
- executar "Atualizar carteira" sobre um rascunho reaplica cotações dos
  provedores e sobrescreve cotações editadas manualmente nesta tela. Em
  2026-10-01 uma reexecução reprecificou o rascunho de outubro às 20:18 no
  horário local, comportamento previsto pela spec 003, mas que agora precisa
  de uma decisão do usuário: avisar, preservar ou permitir sobrescrever.

## Dado observado

Existem dois ativos chamados "Solana" vindos do Excel: um com ticker SOL e
outro com ticker USD, cotado pelo câmbio. Não foi corrigido; precisa de
confirmação do usuário.

## Verificação

Toda a verificação com escrita ocorreu em um banco temporário, criado a
partir das migrações, carregado com a importação e as normalizações do Excel
e removido ao final, com um servidor de produção separado na porta 3100. Os
dados locais do usuário não foram alterados.

Dezessete verificações de domínio passaram, incluindo: recusa de mês passado
sem confirmação; edição com confirmação e desfazer; atomicidade de um lote
com uma posição de outro mês; rateio de 95% recusado e de 60/40 gravado como
fração; recálculo das posições ao alterar a cotação do bitcoin; recusa de
desfazer após mudança posterior e de token reutilizado; e clonagem de
setembro para outubro com 20 posições, 26 de 26 rateios e 12 de 12 cotações,
seguida do desfazer que remove a competência e suas cotações.

Pela interface foram conferidos: edição da quantidade de bitcoin com prévia
de R$ 197.523,00 e recálculo da participação; remoção riscada; salvamento
atômico e desfazer, inclusive de uma remoção, que recriou a posição com o
mesmo identificador, a linha de origem 360 e o rateio de origem 894; trava e
destrave de agosto com a mensagem de histórico; rateio da previdência com a
soma de 91% bloqueando o salvamento e o desfazer restaurando os vínculos com
o Excel; inclusão de uma posição com herança de rateio; e clonagem com
navegação para outubro, desfazer e retorno a setembro.

No Playwright, que roda sobre os dados reais, os novos cenários só editam e
descartam, ou abrem e cancelam a confirmação de histórico, sem gravar. A
edição direta é pulada no perfil de celular. `pnpm check`, `pnpm build` e
`pnpm test:e2e` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: filtros e consulta](013-positions-filters.md)
- [Edição das posições do rascunho](006-draft-position-editing.md)
- [Classificações e metas de alocação](007-allocation-data.md)
- [Atualização mensal manual](003-manual-monthly-update.md)
