/**
 * Ferramentas só do desenvolvimento local (spec 072), como o botão que roda o
 * job das cotações. Ficam no código de todas as branches, inclusive na `main`,
 * e só funcionam no `pnpm dev`: no build, o Next troca `process.env.NODE_ENV`
 * por "production", e a tela e a rota delas ficam inertes. É o único lugar que
 * decide isso; quem usa não repete a condição.
 */
export function devToolsEnabled() {
  return process.env.NODE_ENV === "development";
}
