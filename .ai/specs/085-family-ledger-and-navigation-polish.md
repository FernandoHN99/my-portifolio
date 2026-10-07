# 085 — Ajustes da navegação e da lista de gastos familiares

Estado: concluída e publicada em 2026-10-07 (deploy
`dpl_3sRsmdbo1ms9wEamMbKkUiEy1pRy`).
Origem: revisão detalhada do usuário em 2026-10-07 sobre as specs 081–084.

A [spec 086](086-family-person-and-month-selection.md) revisa depois a seleção
de pessoas e meses, removendo o quadro de saldos por pessoa.

## Decisões e critérios de aceite

1. O botão de recolher fica no topo da barra lateral, só com ícone, na posição
   equivalente ao fechar da gaveta. Expandir permanece acessível com a barra
   recolhida; a preferência continua no cookie.
2. Visão Geral e Posições ficam centralizadas na área útil em telas grandes,
   com a lateral expandida ou recolhida. Ambas têm ícones; o destaque usa
   verde translúcido e contorno discreto, sem preenchimento verde sólido.
   Abaixo de 420 px os dois ícones cedem espaço aos nomes. Configuração
   mantém o nome acessível, mas mostra só a engrenagem abaixo de 640 px.
3. Gastos familiares mostra só “Finanças” no cabeçalho fixo, sem componente
   com aparência de abas Finanças/Gastos familiares.
4. Lançamentos são listas por mês, sem checkboxes, seleção persistente nem
   cabeçalho Descrição/Pessoa/Tipo/Valor/Saldo/Status. Cada item mantém
   descrição, pessoa, tipo, saldo assinado, status e acesso à edição/acerto.
   O valor é mostrado uma única vez, com sinal e tipo indicando o sentido.
5. O acerto individual e por pessoa continua. “Acertar pendentes” confirma
   todos os pendentes do conjunto filtrado, listando os itens antes de gravar;
   Desfazer permanece disponível. Não há barra de seleção.
6. Recebíveis e saldos positivos usam o verde primário; pagamentos usam o tom
   de atenção já existente; zero permanece neutro. Sinais e rótulos continuam
   indicando o sentido sem depender das cores.
7. Os filtros seguem competência → pessoa → status → tipo. Cada lista usa
   somente os filtros anteriores e a busca; a própria seleção não esconde
   alternativas. Seleções seguintes que se tornem indisponíveis são removidas,
   preservando as válidas. URL, filtros no computador, folha do celular,
   indicadores, pessoas e lançamentos usam o mesmo conjunto efetivo.
8. Os backups continuam independentes, conforme a spec 084; não há mudança de
   formato, modelo de dados ou carga dos dados reais nesta fatia.

## Implementação

- `app-shell.tsx` usa colunas laterais iguais no computador para centralizar
  as abas, inclusive quando o botão hambúrguer fica oculto.
- `family-ledger.tsx` organiza os lançamentos em seções nomeadas pelo mês,
  com listas acessíveis e descrição acionável pelo teclado.
- `domain/filters.ts` concentra a resolução dos filtros dependentes; a UI
  normaliza a URL inclusive ao voltar no histórico e após alterações dos dados.
- A revisão começou com stage vazio; as alterações existentes estavam no
  diretório de trabalho. O recolher no topo, os ícones e o tom discreto das
  abas já estavam iniciados e foram preservados.

## Verificação

- `pnpm check`: lint e TypeScript aprovados.
- 16 testes unitários aprovados (9 anteriores + 7 de filtros dependentes).
- 9 testes de integração aprovados no schema `gastos_familiares_teste`,
  incluindo restauração de cada backup preservando a outra área, isolamento
  entre usuários, acerto, desfazer e séries.
- Navegação conferida em Chrome e WebKit: abas sem corte e sem rolagem
  horizontal entre 320 e 1440 px; centralização com diferença máxima de 1 px
  em 1024, 1280 e 1440 px, nas três telas, com lateral aberta e recolhida.
- E2E da área em Chrome, Android/Chrome e iPhone/WebKit: totais coincidentes,
  menus, ausência de overflow de 320 a 430 px e opções dependentes aprovados.
  Na primeira rodada, o teste novo de desktop procurava Pessoa como botão;
  corrigido para o papel real de combobox e repetido com sucesso.
- Acerto dos pendentes filtrados, confirmação, Desfazer e exclusão de série
  aprovados no Chrome com `E2E_FAMILY_WRITES=1`, só no schema de teste.
- Conferência visual no navegador em desktop e 375 px: cabeçalho simples,
  verde da marca, meses diretamente acima da lista e ausência de checkboxes.
- Os cenários sem concessão foram pulados nesta rodada porque o usuário do
  servidor isolado possui a área; o teste de integração confirmou a recusa
  de leitura, escrita e backup para usuários sem a concessão.
- Nenhuma gravação nos gastos reais, mudança em concessões reais, commit ou
  deploy. O servidor de teste recebeu a conta E2E e uma cópia da carga local
  já convertida, exclusivamente no schema `gastos_familiares_teste`.
