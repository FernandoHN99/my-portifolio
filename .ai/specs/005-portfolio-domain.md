# 005 — Domínio inicial da carteira

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

As linhas do Excel estão preservadas, mas ainda não formam um modelo que a
aplicação possa consultar como carteira. A interface não deve depender do JSON
bruto nem reproduzir as fórmulas frágeis da planilha.

## Objetivo

Transformar as posições e cotações válidas da carga inicial em entidades
financeiras tipadas, sem reconstruir a linha inconsistente de junho de 2023.

## Escopo

- instituição e conta como entidades distintas;
- uma conta principal criada para cada instituição presente no Excel;
- ativo canônico e símbolo de cotação separados;
- competência mensal e posição por conta;
- cotações mensais preservadas como dados importados;
- vínculo de posição e cotação com a linha bruta de origem;
- normalizador idempotente para o último lote importado;
- consulta da competência mais recente, evolução e maiores posições.

## Regras

- ativos com ticker usam nome e ticker para identidade canônica entre contas;
- instrumentos sem ticker incluem a instituição na chave de importação;
- posições do mesmo ativo em contas diferentes permanecem separadas;
- valores monetários usam `Decimal` no PostgreSQL;
- fórmulas importadas usam apenas o resultado salvo no XLSM;
- linhas sem data, nome, instituição, quantidade ou total numérico são
  ignoradas pelo normalizador e permanecem disponíveis na auditoria;
- posições exatamente duplicadas no mesmo mês e conta entram uma única vez nos
  totais e geram um achado explícito na auditoria;
- a linha de Bitcoin de junho de 2023 não gera posição normalizada.

## Fora do escopo

- classificação e percentual das posições;
- edição de posições;
- fechamento mensal;
- provedores externos e atualização de preços.

## Critérios de aceite

- executar o normalizador duas vezes não duplica dados;
- cada posição normalizada mantém referência à linha de origem;
- a visão geral usa somente posições normalizadas e valores reais;
- as migrações partem de um banco vazio;
- lint, tipos, build e testes passam.

## Referências

- [Importação auditável](002-excel-import.md)
- [Arquitetura](../../docs/architecture.md)
