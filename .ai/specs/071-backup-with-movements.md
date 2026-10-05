# 071 — Backup convertido com movimentações

Estado: v1 gerada, validada e restaurada na carteira local em 2026-10-05. No
mesmo dia, a v2 a substituiu com as regras novas do usuário (seção "Versão 2")
e também foi restaurada localmente. A produção não foi alterada.
Origem: pedido do usuário em 2026-10-04. O backup fiel dele vinha do tempo
anterior às movimentações; ele pediu um arquivo novo em que cada posição tenha
pelo menos uma movimentação, para usar daqui em diante, perguntando cada dúvida
sobre o tipo de cada mudança.

## Relação com regras anteriores

O [prompt de continuidade](../context/position-transactions-prompt.md), seção 3,
pedia para não reconstruir compras ou rendimentos a partir de saldos mensais. O
pedido explícito do usuário em 2026-10-04 abre uma exceção para este arquivo. As
regras abaixo são as dele, respondidas na conversa. O app continua sem converter
nada sozinho.

## Regras confirmadas pelo usuário

1. O primeiro mês do histórico (jun/2023) vira Saldo inicial. Uma posição que
   aparece depois, inclusive a que volta após sumir, vira Aporte do valor
   inteiro.
2. Contas correntes (conta bancária, cofrinhos, saldos em conta, conta em
   dólar): toda mudança é aporte ou retirada.
3. Renda fixa (CDB, LCI, LCA, LCD, LIG, fundo), stablecoins, Time Deposit, conta
   remunerada e cripto: "dificilmente são aportes", com bom senso caso a caso.
   - Alta de até 2% no mês é rendimento.
   - Acima disso, como as entradas evidentes nos CDBs de liquidez diária, é
     aporte.
   - Queda é retirada.
   - Na cripto, a alta pequena é rendimento em unidades (staking).
4. Tesouro Direto e previdência guardados como saldo ("nunca saquei"): queda é
   rendimento negativo, alta até 2% é rendimento e acima disso é aporte.
5. ETFs: aumento de cotas é compra (aporte), redução é venda (retirada).
6. Data: o último dia do mês, ou hoje no mês corrente.
   - Preço executado: a cotação do mês (o câmbio no caixa em dólar); nulo nos
     saldos em reais.
   - Observação: "Convertida do histórico mensal".

## Resultado

- A base de cada mês (`openingQuantity`) é o fechamento do mês anterior da mesma
  posição, ou zero quando a posição começa no mês.
- A soma da base com as movimentações reproduz a quantidade de todas as
  posições, conferida no próprio roteiro.
- Cada posição (ativo numa instituição) tem pelo menos uma movimentação. Meses
  sem mudança ficam sem movimentação, como no app.
- O rendimento negativo usa a mesma representação do acerto de liquidação: valor
  negativo e quantidade positiva, que reduz o saldo.
- Os ativos ganham o tipo da [spec 068](068-fixed-classification-and-asset-type.md).
- O formato continua na versão 5.

Totais, sem valores da carteira: 457 posições mensais e 233 movimentações, das
quais 110 aportes, 80 rendimentos, 37 retiradas e 6 saldos iniciais.

## Verificação

- Restauração num schema de teste (`backupmov`) com um usuário de teste: as
  contagens batem.
- Exportação de volta: as tabelas da carteira idênticas campo a campo. As
  cotações compartilhadas mudam só de id, como prevê o formato.
- A página de uma posição de Tesouro mostrou aportes, rendimentos negativos e a
  variação mês a mês a partir das movimentações convertidas.

## Versão 2 (2026-10-05)

Ao ver a v1 no app, o usuário refinou as regras e mandou o relatório
consolidado do Inter de 27/09/2026, com cada aplicação (data, quantidade, valor
aplicado e valor bruto). O relatório tem dados pessoais: fica fora do
repositório, e serve só para identificar as aplicações.

Regras da v2, que substituem as da v1 onde divergem:

1. **A primeira aplicação de cada posição é sempre Saldo inicial**, também
   depois de jun/2023. Aporte só existe depois que a posição foi criada. A volta
   de uma posição depois de uma lacuna continua sendo aporte.
2. **LCI, LCA, LCD e LIG:** só a aplicação inicial. Todo crescimento depois
   dela é rendimento.
3. **CDBs fora das contas** (incluindo o Porquinho, um CDB) têm aportes e
   rendimentos. O rendimento do mês é estimado pelo CDI diário do Banco Central,
   no percentual de cada título:
   - uma alta até 1,5 vez o estimado é toda rendimento;
   - acima disso, o estimado é rendimento e o resto é aporte;
   - nos que são caixa, uma queda é retirada (mais o rendimento do mês).
4. **Tesouro Renda+:** as cinco aplicações do relatório; o resto é rendimento,
   positivo ou negativo. As duas aplicações de agosto/2025 entram no mês em que
   o saldo anotado as reflete (setembro), com a data real na observação.
5. **Tesouro IPCA+ 2032:** só a aplicação inicial; o resto é rendimento.
6. **Previdência:** as parcelas da aba Previdência da planilha são os aportes,
   e o resto, positivo ou negativo, é rendimento.
   - O usuário confirmou que a alta de fev/2026, sem parcela, é rendimento.
   - A primeira parcela entra como saldo inicial pelo valor aplicado, com a
     diferença até o primeiro saldo anotado como rendimento. A LCD BDMG e a LCD
     BNDES seguem o mesmo critério, pelos valores aplicados do relatório.
7. **Sem retiradas:** Tesouro, Previdência e renda fixa fora do caixa nunca têm
   retirada. Contas correntes continuam só com aportes e retiradas.
8. **Fora da carteira:** uma segunda LCD BNDES do relatório, que não aparece em
   nenhum mês da carteira do app, ficou de fora por decisão do usuário.

Conferências do roteiro:

- as 51 posições começam com saldo inicial;
- nenhuma retirada em LCI, LCA, LCD, LIG, Tesouro ou Previdência;
- a base mais as movimentações reproduz a quantidade das 457 posições mensais.

Totais da v2, sem valores: 278 movimentações, sendo 51 saldos iniciais,
56 aportes, 134 rendimentos e 37 retiradas.

As telas que mostram esses dados estão na
[spec 073](073-position-page-applied-value-and-nav-trail.md), com a conferência
de todas as posições e competências.

## Arquivos fora do Git

- `backups/meu-portfolio-backup-2026-10-05-movimentacoes-v2.json`: o backup em
  uso (v2).
- `backups/revisao-movimentacoes-2026-10-05-v2.md`: cada movimentação da v2,
  com o motivo da classificação.
- `backups/meu-portfolio-backup-2026-10-05-movimentacoes.json` e
  `backups/revisao-movimentacoes-2026-10-05.md`: a v1, substituída.
- `backups/local-antes-da-v2-2026-10-05.json`: a carteira local antes da v2.

## Depois da restauração local

- Antes de restaurar, a carteira local foi exportada para
  `backups/local-antes-da-071-2026-10-05.json`, fora do Git.
- Com as movimentações registradas, a página da posição passa da decomposição
  estimada à registrada (spec 058): "Saldo de partida", "Aportes menos
  retiradas", "Rendimentos incorporados" e "Efeito de preço".
- O preço médio de uma posição com saldo inicial fica "Custo de compra
  desconhecido", porque o saldo inicial não é custo.
- Os testes de `position-history.spec.ts` foram atualizados para esses valores.
- A tabela mês a mês deixava de mostrar "Volta" quando a posição voltava num mês
  com movimentações; agora mostra nos dois modos.
- No arquivo, todas as competências estão fechadas, inclusive out/2026. Para
  movimentar, o usuário abre o mês na linha do tempo; até lá, os testes que
  editam ficam pulados.

O roteiro da conversão ficou fora do repositório, porque leva nomes dos ativos
dele. Para corrigir uma movimentação específica depois da restauração, reabrir o
mês e usar Movimentar ou a correção da movimentação.
