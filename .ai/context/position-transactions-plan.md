# Plano proposto: transações nas posições

**Versão anterior, substituída pelo [prompt consolidado](position-transactions-prompt.md).**
As respostas finais confirmaram saldo inicial com preservação do legado,
liquidação com destino nesta etapa e correções restritas ao mês, sem cascata.
Use o prompt consolidado como fonte principal; as pendências abaixo são históricas.

Registrado em: 2026-10-04.
Atualizado após respostas da segunda rodada, em 2026-10-04.
Estado: planejamento solicitado pelo usuário; não iniciado no aplicativo.
Fonte das decisões e perguntas:
[Descoberta dos próximos ajustes](next-adjustments-discovery.md).

## Resultado pretendido

Continuar atualizando a carteira rapidamente, agora guardando os movimentos
que explicam seus valores. O lápis edita os atributos da posição; o botão de
movimentação registra aporte, retirada e rendimento. Correções de valores
editam a transação específica do mês aberto.

O usuário escolhe os números que tem em mãos e o formulário calcula os demais,
com uma prévia de antes, movimento e depois. Caixa de origem/destino não é
obrigatório e aportes/retiradas comuns não alteram outros caixas nesta etapa.
Os dois modos, valor desta operação e novo total da posição, estão confirmados.
Rendimento é uma categoria genérica para diferenciar retorno de aporte, sem
subcategorias obrigatórias. A referência mobile é Safari no iPhone 16 Plus.

As fatias abaixo são propostas para futuras specs, sem reservar números.
Cada spec só será criada quando a respectiva regra estiver definida. Nenhuma
etapa publica na Vercel, altera produção ou implica autorização de commit.

## Base existente a preservar

- Fotografias mensais e navegação por competência continuam úteis para a
  consulta; transações passam a explicar os valores no trecho com movimentos.
- Isolamento por usuário, cotações compartilhadas e mês aberto/fechado.
- Backup por usuário, seguindo [o formato e suas conversões](../../docs/backup-format.md).
- [Spec 053](../specs/053-scheduled-quote-sync.md): sincronização das cotações
  fora da navegação. Integrações futuras devem seguir essa estrutura.
- [Spec 054](../specs/054-derived-currency-and-single-target-plan.md): moeda
  geral derivada, plano vigente único e Versões só com backups importados.
- [Spec 055](../specs/055-empty-portfolio-start.md): carteira vazia funcional,
  primeira posição e restauração de backup.

As specs 054/055 já constam concluídas localmente por outra frente. Este plano
não volta a implementá-las; inclui sua preservação nos novos fluxos.

## Formas propostas de preenchimento

| Dados conhecidos | Resultado calculado |
| --- | --- |
| Quantidade movimentada + preço unitário executado | Valor pago/recebido |
| Valor da operação + preço unitário executado | Quantidade comprada/vendida |
| Valor da operação + quantidade movimentada | Preço unitário executado |
| Quantidade total após a operação + preço executado | Diferença de quantidade e valor da operação |
| Saldo manual total após a operação | Diferença em dinheiro para o saldo anterior |
| Valor de mercado total após a operação + cotação de referência | Quantidade final; preço executado calcula o dinheiro movimentado |

O usuário confirmou na segunda rodada que os dois caminhos precisam existir:
valor da operação e valor total da posição após ela. Para um ativo cotado, o
alvo de valor de mercado usa a cotação de referência para chegar à quantidade;
o valor da operação usa o preço executado. Para saldo manual, o total final
determina diretamente a diferença em dinheiro. Os campos devem nomear esses
papéis claramente e mostrar o resultado sem impor mais passos que o necessário.

O formulário deve indicar quais números foram digitados e quais calculou.
Quando uma combinação não determina os fatos da operação, pede somente o
dado que falta. Quando dados entram em conflito, mostra a divergência na
prévia e deixa o usuário corrigir; não substitui silenciosamente um valor.

Exemplo de saldo manual: antes R$ 10.000; usuário informa depois R$ 10.500;
aporte calculado R$ 500. Para retirar, depois R$ 9.500 gera retirada R$ 500.

Exemplo cotado: antes 10 unidades; compra 2 a R$ 25; movimento R$ 50; depois
12 unidades. Com cotação de R$ 30, o valor de mercado depois é R$ 360.
Preço executado e cotação são guardados/consumidos com seus papéis próprios.

## Ordem proposta e critérios de aceite

### Fatia A — Base das transações, meses e backup

Definir e implementar a identidade da posição ao longo dos meses, o registro
das transações por usuário e sua relação com as fotografias mensais. Manter
quantidades, valores e cálculos financeiros em decimal. Cada movimento
guarda a data financeira, tipo e os fatos necessários de quantidade/valor/preço.

Proposta para a carteira existente: preservar o histórico mensal e começar
com um saldo de abertura, sem criar compras fictícias. Saldo inicial não
significa aporte novo nem custo de aquisição conhecido. A possibilidade de
registrar operações antigas reais depende da resposta do usuário.

Aceite:

- restaurar backup anterior mantém valores, classificações e histórico;
- transações fazem parte do backup e têm ida/volta verificada em schema isolado;
- usuário não alcança posições/transações de outro usuário;
- criação, correção e remoção de movimento refazem os valores afetados de
  forma atômica, sem sobrescrever os demais movimentos;
- mês fechado recusa alteração de transação; mês aberto permite conforme as
  regras atuais de reabertura;
- virada de mês parte do estado correto e não reaplica movimentos já contados;
- custo de compra desconhecido do histórico não vira preço médio real;
- regra de propagação de correções a meses posteriores explicitamente definida.

Dependências de descoberta: estratégia de abertura do histórico, operações
retroativas e propagação ao reabrir mês antigo. Rendimento já está definido
como categoria genérica; seu efeito segue os fatos da operação, sem presumir
reinvestimento ou transferência para caixa.

### Fatia B — Formulário de movimentação e lápis de atributos

Adicionar a ação ao lado do lápis e na página da posição. Usar um formulário
único para aportar, retirar e registrar rendimento genérico, com combinações flexíveis
de entrada e prévia. Na posição nova, cadastrar atributos e movimento inicial
em um fluxo contínuo, preservando o primeiro uso da spec 055.

O lápis da posição deixa de permitir sobrescrever quantidade/saldo e mantém
os atributos. A lista de movimentos oferece edição da transação específica
e atualização da prévia, respeitando o mês aberto.

Aceite:

- os modos da tabela de preenchimento aprovados funcionam para aporte e retirada;
- usuário pode mudar os dados conhecidos sem reiniciar o formulário;
- prévia distingue quantidade final, dinheiro movimentado e valor de mercado;
- informar R$ 500 e depois corrigir o aporte para R$ 1.000 altera esse registro
  e refaz os saldos, preservando as outras operações;
- não permite retirada maior que quantidade/saldo disponível, salvo uma regra
  diferente expressamente definida; não introduz posição vendida;
- sem caixa de origem/destino obrigatório e sem movimentação automática de caixa;
- números, moeda, quantidade fracionária e campos calculados são claros no desktop
  e no iPhone;
- novos valores não podem continuar sendo gravados por uma ação antiga de edição
  direta do saldo, contornando o registro de transações.

### Fatia C — Histórico e explicação dos valores

Mostrar os movimentos da posição com data, tipo, quantidade/preço quando
aplicáveis e dinheiro movimentado. Os gráficos e indicadores passam a usar
os movimentos registrados no trecho em que há dados suficientes.

Aceite:

- aporte/retirada ficam separados de variação de cotação e rendimento;
- Rendimento é tratado como retorno e não como aporte de dinheiro novo;
  o registro de um dividendo não cria unidades de ativo automaticamente;
- saldo inicial, ajustes e estimativas legadas têm significado explícito;
- preço médio/custo real só são apresentados quando conhecidos; não transforma
  avaliação de mercado de abertura em custo real;
- compra, retirada e correção produzem totais consistentes na posição, tabela
  mensal, Visão Geral e backup;
- posição encerrada mantém operações e histórico consultáveis.

O objetivo é explicar a evolução da carteira; métodos adicionais de desempenho
ou apuração tributária não foram pedidos e não entram implicitamente.

### Fatia D — Renda fixa com cálculo bruto

Adicionar características explícitas aos ativos de renda fixa: modalidade,
indexador contratado, percentual/taxa, datas financeiras e vencimento opcional.
Não adivinhar essas características pelo nome de um ativo antigo.

Começar pela modalidade a percentual do CDI, já exemplificada pelo usuário.
Usar série histórica observada para o período passado de cada aporte e uma
hipótese declarada para o futuro. Atualização do valor bruto pode funcionar
independentemente das transferências de caixa, que estão adiadas.

Aceite:

- aporte de hoje não rende desde a abertura de uma aplicação antiga;
- retirada reduz corretamente o saldo que continuará rendendo;
- avaliação para uma competência passada considera sua data de referência;
- bruto acumulado até a última taxa disponível é separado da projeção futura;
- IR/IOF não entram nesta primeira etapa, conforme pedido;
- rendimento automático e lançamento manual do mesmo período não são somados
  duas vezes; a regra para eventual conferência com extrato precisa ser definida;
- falta de taxa mantém o último valor válido com a data de referência;
- cálculos verificados por cenários conhecidos, inclusive múltiplos aportes,
  retirada, fim de semana e vencimento;
- modelo e backup atualizados juntos.

Indexadores adicionais, remuneração de caixa pela Selic e regras de produtos
específicos serão definidos com o usuário antes de ampliar esta fatia.

### Fatia E — Tesouro por quantidade

Verificar cobertura da fonte oficial pesquisada para os títulos usados pelo
usuário, inclusive títulos com pagamentos periódicos e fora de oferta.
Identificar por tipo e vencimento, obter preço unitário e acompanhar o valor
de mercado pela quantidade.

Aceite:

- fonte gratuita e oficial, com identificação inequívoca e data do preço;
- manter o último preço válido quando a fonte falhar;
- preço de mercado, custo executado e valor efetivamente recebido não se confundem;
- integrar busca e armazenamento ao fluxo de cotações da spec 053;
- não tratar juros periódicos como recebimento automático sem regra definida;
- documentação da cobertura e teste com respostas simuladas/observadas.

Esta fatia fica condicionada à cobertura e à escolha de valor de mercado
como representação desejada pelo usuário. Fontes e limites estão na descoberta.

### Fatia F — Revisão completa no iPhone

Pode ocorrer em paralelo às fatias financeiras sobre as telas existentes.
Depois da fatia B, revisar também o formulário e a lista de transações.

Referência confirmada: Safari no iPhone 16 Plus. Cobrir entrada/cadastro,
inicial normal/vazia, Posições normal/vazia, formulário
de posição, detalhe, cotações, Configuração e backup. Conferir também erros,
confirmações, seletores, sliders, tabelas, teclado aberto e orientação horizontal.

Aceite:

- sem corte de texto/controles ou rolagem lateral involuntária da página;
- inputs legíveis, sem zoom provocado por fonte pequena;
- teclado aberto não impede salvar, cancelar ou ler validações;
- sliders e botões utilizáveis com toque;
- rolagem de tabelas/controles não provoca troca de aba;
- faixa de competências e áreas seguras do iPhone respeitadas;
- o controle relatado como swipe espremido é identificado e corrigido;
- verificação local com viewport de iPhone/WebKit, além do Chrome atual;
- registrar separadamente a verificação em emulação e no aparelho real.

O modelo/navegador foram respondidos. A localização exata do swipe não foi
indicada; conferir deslizantes de metas, faixa de meses e gesto de abas.

### Caixa e liquidação — aguardam definição de escopo

Aportes/retiradas comuns com transferência automática estão adiados.
Renomear Saldo em dólar para Caixa em dólar continua como pedido de interface.
Flag de conta corrente e botão de liquidar com destino devem ser planejados
conforme a resposta sobre vencimentos, sem presumir uma exceção ao adiamento.

Se a liquidação com destino continuar agora, será uma spec própria: saída
da posição, crédito no caixa e encerramento atômicos, com valor recebido
confirmado e histórico preservado. Transferência interna não é aporte externo.
Se também ficar adiada, o usuário registra retirada e entrada de caixa manualmente.

## Verificação e limite desta entrega

Neste atendimento foram editados somente documentos de descoberta/plano.
Não houve migração, gravação no banco, mudança de código do aplicativo,
deploy ou commit. Os testes descritos são critérios das futuras fatias,
não verificações já executadas.

Antes de implementar uma fatia, converter seu escopo definido em spec pequena
e ler as instruções e guias locais aplicáveis. Usar schemas isolados para
qualquer teste que escreva dados. Revalidar o estado da árvore, pois outras
frentes estão alterando o mesmo projeto.
