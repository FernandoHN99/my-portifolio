# 001 — Fundação da aplicação

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

O repositório ainda contém apenas a planilha e a documentação. As próximas
funcionalidades precisam de uma base local, tipada e verificável.

## Objetivo

Criar a fundação do aplicativo pessoal em Next.js, com PostgreSQL no Docker,
persistência tipada, interface-base e testes de fumaça.

## Escopo

- Next.js com App Router e TypeScript, usando pnpm;
- aplicação executada diretamente no computador;
- PostgreSQL executado pelo Docker Compose;
- Prisma com versão estável e migrações versionadas;
- configuração por variáveis de ambiente, sem credenciais reais no Git;
- página inicial com estado real da aplicação e do banco;
- linguagem visual inicial para o produto financeiro;
- lint, verificação de tipos, build e teste de fumaça com Playwright;
- documentação para executar o ambiente local.

## Regras

- Não exigir login.
- Não expor o servidor além do padrão local do Next.js.
- Não inventar valores financeiros para preencher a interface.
- Usar valores decimais exatos quando o modelo financeiro for criado.
- Manter lógica de servidor separada dos componentes visuais.
- Tratar carregamento, indisponibilidade do banco e estado vazio.

## Fora do escopo

- importar o Excel;
- buscar cotações;
- duplicar o mês anterior;
- implementar gráficos, metas, rebalanceamento ou previdência.

## Critérios de aceite

- `pnpm dev` inicia a aplicação;
- `docker compose up -d` inicia o PostgreSQL;
- a aplicação informa se o banco está disponível sem quebrar a página;
- a migração inicial pode ser aplicada em um banco vazio;
- lint, tipos, build e teste de fumaça passam;
- a página funciona em tamanhos desktop e mobile;
- nenhum segredo ou dado financeiro fictício é versionado.

## Referências

- [Arquitetura aprovada](../../docs/architecture.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
- [Análise do VBA](../context/vba-analysis.md)
