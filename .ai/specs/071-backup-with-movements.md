# 071 — Backup convertido com movimentações

Estado: arquivo gerado e validado em 2026-10-05, num schema de teste. A carteira
local e a produção não foram alteradas.
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

## Arquivos fora do Git

- `backups/meu-portfolio-backup-2026-10-05-movimentacoes.json`: o backup novo.
- `backups/revisao-movimentacoes-2026-10-05.md`: cada movimentação, com o motivo
  da classificação, para o usuário conferir.

O roteiro da conversão ficou fora do repositório, porque leva nomes dos ativos
dele. Para corrigir uma movimentação específica depois da restauração, reabrir o
mês e usar Movimentar ou a correção da movimentação.
