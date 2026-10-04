# 054 — Moeda sobre o total calculada e metas sem versões

Estado: concluída localmente em 2026-10-04 (sem deploy).
Definida em: 2026-10-04

## Problema

Pedidos do usuário em 2026-10-04:

- "Na configuração de metas da carteira, remover o Moeda sobre o patrimônio
  total: ele deve ser read-only, pois o que realmente define isso é a Moeda
  dentro de cada classe";
- "Em versões, somente trazer a versão quando algo for 'Backup importado';
  coisas diferentes disso, como 'Altcoins separadas do dólar', nem devem
  existir!"

Cada salvamento das metas criava um plano novo e desativava o anterior, e a
seção "Versões" listava esses planos junto com os backups importados. A meta
de moeda sobre o total era editada à parte e podia contradizer a moeda de cada
classe: no banco local, a gravada era BRL 39%, BTC 32,5% e USD 28,5%, e a que
sai das classes é BRL 38%, BTC 32,55% e USD 29,45%.

## Comportamento

- **Moeda sobre o total calculada**: moeda(c) = Σ classe(k) × moeda dentro da
  classe(k, c). No editor, a seção "Moeda" não tem deslizante nem campo, mostra
  o valor calculado e acompanha o rascunho das classes e da moeda de cada
  classe. A soma dela não entra na validação, porque sai das outras metas;
- as análises (rebalanceamento, Visão Geral) usam sempre a moeda calculada,
  inclusive num plano gravado antes desta regra (`withDerivedCurrency` em
  `getActivePlan`). Ao salvar, o servidor ignora o valor enviado para a moeda e
  grava o calculado;
- **uma só meta por usuário**: salvar altera o plano vigente no lugar (os
  percentuais e a tolerância), sem criar versão. O topo da configuração mostra
  a data da última alteração em vez do nome da versão;
- **Versões**: lista só os backups importados ("Backup importado", com a data
  da exportação e da importação). Sem backup importado, a seção não aparece;
- a migração `20261004130000_single_target_plan` apaga os planos inativos
  (as versões antigas, com as metas delas) e recalcula a moeda sobre o total
  dos planos vigentes;
- a restauração de um backup antigo, que traz as versões anteriores, grava só
  o plano vigente. O formato do arquivo não muda (versão 4).

## Critérios de aceite

- a seção Moeda não tem campo e muda quando a meta de uma classe muda;
- salvar as metas não cria plano novo;
- "Versões" só lista backups importados;
- restaurar o backup de 2026-10-03, que tem três planos, deixa um.

## Verificação

Em 2026-10-04:

- banco local, depois da migração: um plano por usuário, e a moeda sobre o
  total ficou em BRL 38%, BTC 32,55%, USD 29,45% e Altcoins 0%;
- schema de teste: restaurar `meu-portfolio-backup-2026-10-03-2016.json`
  (três planos) gravou um plano, com as 40 metas;
- `tests/e2e/target-settings-adjustments.spec.ts`: as versões só listam
  backups importados, e a seção Moeda não tem campo e acompanha a mudança na
  meta de Caixa (13 passaram, 2 pulados por serem só de toque).

## Referências

- [Metas padrão](048-default-targets-and-quotes-button.md)
- [Formato do backup](../../docs/backup-format.md)
