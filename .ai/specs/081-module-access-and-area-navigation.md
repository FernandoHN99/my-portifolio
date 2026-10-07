# 081 — Acesso por área e menu lateral

Estado: concluída localmente em 2026-10-07; aguarda aprovação de commit e
deploy. Migração aplicada no banco local.
Origem: pedido do usuário em 2026-10-07 ("manda ver"), sobre o
[prompt de continuidade](../context/gastos-familia-prompt.md) e a direção do
[backlog](../context/backlog.md).

## Problema

O app passa a ter mais de uma área (Investimentos e Gastos familiares, sob
Finanças). Os amigos usam só Investimentos; as áreas pessoais são só do dono.
Não havia papéis nem concessões por área.

## Decisões

- **Investimentos é a área-base:** todo usuário com login a usa, sem
  concessão, como antes. As áreas pessoais pedem uma concessão
  (`module_grants`, enum `AppModule`, hoje só `FAMILY_EXPENSES`).
- **Papéis separados das áreas:** `role_grants` (enum `AppRole`, hoje só
  `ADMIN`) servem a ações administrativas; um papel não dá leitura dos dados
  pessoais de outro usuário. O plugin Admin do Better Auth não foi adotado:
  não havia necessidade real de gerenciar papéis pela interface.
- **Quem concede é o servidor:** a migração `20261007120000_family_expenses_and_module_access`
  resolve a conta `nandohneto@gmail.com` pelo e-mail no banco e grava a
  concessão e o papel no id dela; sem a conta, nada é concedido. Depois,
  `pnpm auth:access list | grant | revoke <e-mail> gastos-familiares|admin`.
  A interface não tem como pedir nem atribuir acesso, e o cadastro não
  concede nada.
- **Conferência em todas as portas:** `src/modules/access/application/module-access.ts`
  lê as concessões a partir da sessão confirmada no servidor.
  - páginas: `requireModulePage` → 404 sem a concessão, inclusive por URL direta;
  - rotas de API: `rejectWithoutModule` → 401 sem sessão, 404 sem concessão;
  - leituras, gravações, backup e roteiros: `getFamilyDb` (spec 082) chama
    `assertModuleAccess` antes de devolver o cliente com escopo do usuário;
    as Server Actions herdam essa conferência.
- **Navegação** (`src/components/product/app-frame.tsx` e `area-nav.tsx`):
  - com mais de uma área, barra lateral a partir de 1024 px, recolhível (a
    escolha fica no cookie `areas-sidebar`, lido no servidor para não piscar),
    com a marca, o grupo Finanças, as áreas e a conta com "Sair";
  - abaixo de 1024 px, o botão hambúrguer toma o lugar da marca e abre uma
    gaveta pela esquerda (Base UI Drawer): foco preso, Esc, fundo, X, arraste
    para a esquerda e escolha de área fecham, e o foco volta ao botão;
  - com uma área só (os amigos), a página é exatamente a de antes: sem barra
    nem hambúrguer;
  - o topo de Investimentos continua com as abas, a hora das cotações, a
    engrenagem e a faixa de competências; com o hambúrguer, a hora das
    cotações sai abaixo de 360 px para as abas caberem (segue em Cotações);
  - o link de Investimentos leva o `?mes=` aberto; os filtros de Gastos
    familiares usam outros parâmetros e não mexem no mês da carteira.

O ajuste posterior do recolher no topo e das abas de Investimentos está na
[spec 085](085-family-ledger-and-navigation-polish.md).

## Critérios de aceite

1. A conta indicada acessa Investimentos e Gastos familiares; outro usuário
   acessa só Investimentos, com a carteira e as telas de sempre.
2. Sem a concessão, Gastos familiares não aparece no menu e responde 404 por
   URL, rota de API e restauração; as gravações recusam com `ModuleAccessError`.
3. Barra lateral no computador e hambúrguer no celular, com teclado e toque,
   sem rolagem horizontal de 320 a 430 px; os fluxos de Investimentos seguem.

## Verificação

- Integração (`tests/integration/family-expenses.test.ts`, schema
  `gastos_familiares_teste`): usuário sem concessão recebe `ModuleAccessError`
  na leitura, na gravação e no backup, sem nenhuma linha gravada.
- E2E (`tests/e2e/family-expenses.spec.ts`) num servidor de teste
  (`.claude/launch.json`, configuração `gastos-teste`, porta 3110):
  - como o amigo de teste: sem barra, sem hambúrguer, sem link, página 404,
    API 404 e restauração 404 (Chrome, Android e Safari do iPhone);
  - como o dono de teste: barra lateral com a área ativa, hambúrguer com Esc
    devolvendo o foco, troca de área, sem rolagem lateral em 320, 375 e 430 px.
- Navegador: 320 px em Posições e Configuração com o hambúrguer, abas inteiras
  e sem rolagem; barra recolhida a 72 px vinda do servidor.
- Banco local: `pnpm auth:access list` mostra `nandohneto@gmail.com` com
  `FAMILY_EXPENSES` e `ADMIN`, e `local@meu-portfolio.test` só com
  Investimentos.
