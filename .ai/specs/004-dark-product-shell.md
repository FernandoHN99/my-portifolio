# 004 — Shell visual dark e revisão da importação

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

A interface-base comprova a conexão local, mas ainda não representa a
identidade desejada para o produto e concentra toda a composição na rota
inicial. Os achados da importação também não possuem uma tela própria.

## Objetivo

Estabelecer um shell dark de fintech moderna, premium e confiável, organizar a
interface em componentes focados e apresentar a primeira visão financeira com
os dados normalizados da carga inicial.

## Escopo

- tema exclusivamente escuro, responsivo e acessível;
- navegação persistente para visão geral e revisão da importação;
- painel inicial alimentado por posições financeiras reais;
- tela de revisão com agrupamento e localização dos achados;
- componentes de produto separados das rotas do App Router;
- estados vazios e de banco indisponível;
- movimentos curtos, com suporte a redução de movimento.

## Regras visuais

- superfícies grafite e alto contraste, sem preto puro como única camada;
- esmeralda como destaque principal, sem competir com estados de alerta;
- tipografia monoespaçada somente em números, códigos e referências;
- sem tema claro, gradientes chamativos, vidro excessivo ou dados fictícios;
- estados interativos claros em teclado, mouse e toque.
- não usar a interface para apresentar roadmap, progresso de implementação ou
  estado das specs.

## Fora do escopo

- gráficos patrimoniais;
- edição ou resolução dos achados;
- atualização de cotações.

## Critérios de aceite

- a rota inicial contém apenas orquestração de dados e composição;
- a revisão apresenta dados reais e não falha quando o banco estiver offline;
- a navegação funciona em desktop e celular;
- não há rolagem horizontal nas larguras cobertas pelos testes;
- lint, tipos, build e testes de fumaça passam.

## Referências

- [Arquitetura e direção visual](../../docs/architecture.md)
- [Importação auditável](002-excel-import.md)
