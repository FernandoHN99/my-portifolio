# 003 — Atualização mensal manual

Estado: planejada
Definida em: 2026-10-01

## Problema

A planilha cria o mês a partir do último conjunto de posições e consulta
cotações quando o usuário aciona o botão. O aplicativo precisa preservar
esse fluxo, eliminando gravações parciais e valores inválidos.

## Objetivo

Oferecer uma ação manual que copie as posições do mês anterior, consulte as
cotações e deixe o novo mês disponível para edição.

## Comportamento esperado

1. O usuário clica em atualizar.
2. O sistema verifica se o mês atual já existe.
3. Se necessário, copia as posições do último mês para um novo rascunho.
4. Busca cotações somente nesse momento e enquanto a aplicação está ativa.
5. Converte preços preservando moeda, fonte e horário.
6. Mostra sucesso ou falha de cada item.
7. O usuário altera quantidades, saldos e classificações manualmente.

## Regras confirmadas

- não existe agendamento em segundo plano;
- não atualizar com o computador ou aplicativo desligado;
- respeitar os limites gratuitos dos provedores;
- não preencher automaticamente meses intermediários sem confirmação;
- não gravar texto em campo numérico;
- mudanças de preço não alteram quantidade;
- a operação deve ser transacional e repetível.

## Questões para esta etapa

- provedores que ainda funcionam e seus limites atuais;
- ordem de preferência e fallback entre fontes;
- tratamento de ativos sem ticker e saldos manuais;
- regra de edição e fechamento do rascunho mensal.

## Dependência

Conclusão das specs 001 e 002.
