# 002 — Importação auditável do Excel

Estado: em andamento
Definida em: 2026-10-01

## Problema

O histórico real está em `raw_file/01-Investimentos.xlsm` e contém
inconsistências conhecidas. A migração não pode perder a origem nem aplicar
correções silenciosas.

## Objetivo

Importar os dados financeiros do Excel de forma repetível, preservar cada
linha de origem e apresentar divergências para revisão.

## Escopo previsto

- registrar arquivo, hash e instante de cada importação;
- carregar primeiro dados brutos das tabelas relevantes;
- validar tipos, datas, duplicidades, fórmulas quebradas e referências;
- separar aviso de erro impeditivo;
- permitir repetir a importação sem duplicar registros;
- criar entidades estáveis de instituição, conta, ativo e posição somente
  depois da validação dos dados brutos;
- produzir uma tela de revisão das inconsistências.

## Regras confirmadas

- o Excel é a fonte da carga inicial;
- o arquivo original nunca é alterado pelo importador;
- correções necessárias serão pontuadas para decisão do usuário;
- nomes iguais não bastam para identificar uma posição;
- o ativo é uma identidade canônica, mas posições do mesmo ativo em
  instituições ou contas diferentes permanecem separadas;
- Bitcoin, USDC e outros ativos repetidos só são agregados nas consultas e
  relatórios que pedirem uma visão consolidada;
- a posição inconsistente de Bitcoin de junho de 2023 permanece pendente e
  não será reconstruída automaticamente;
- credenciais encontradas no VBA não são importadas.

## Fora do escopo

- cotações ao vivo;
- atualização mensal;
- correção automática do histórico;
- previdência, gráficos e rebalanceamento.

## Dependência

Spec 001 concluída.

## Implementado nesta etapa

- lote de importação com caminho, hash, estado e contagem de linhas;
- armazenamento das linhas brutas por aba, tabela e linha de origem;
- registro estruturado de avisos e erros de validação;
- exclusão em cascata limitada aos registros do mesmo lote;
- migração inicial do PostgreSQL.
- importador em streaming das tabelas `Table_Investimentos_Main`,
  `Table_Investimentos_Porcent` e `Table_Cotacoes`;
- idempotência pelo SHA-256 do arquivo;
- primeira carga verificada com 904 linhas e 14 achados: 7 valores numéricos
  inválidos, 6 identidades ambíguas e 1 regra de busca sem instituição.

## Próximo incremento

Criar a tela de revisão dos achados restantes e, depois, introduzir as
entidades financeiras normalizadas em migrações pequenas. A linha de junho de
2023 continuará visível como pendência até existir evidência suficiente ou uma
decisão explícita do usuário.
