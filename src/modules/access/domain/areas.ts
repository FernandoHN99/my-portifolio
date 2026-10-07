import type { AppModule } from "@/generated/prisma/enums";

// Áreas do aplicativo (spec 081), agrupadas por assunto. Investimentos é a área-
// base: todo usuário com login a usa, sem concessão. As demais pedem a
// concessão do módulo, conferida no servidor em cada página, ação e rota.

export type AreaKey = "investments" | "family-expenses";

/** Cookie da barra lateral recolhida, lido no servidor para não piscar. */
export const SIDEBAR_COOKIE = "areas-sidebar";

export type AppArea = {
  key: AreaKey;
  label: string;
  href: string;
  group: string;
  /** Concessão exigida; nula na área-base. */
  module: AppModule | null;
};

export const APP_AREAS: readonly AppArea[] = [
  { key: "investments", label: "Investimentos", href: "/", group: "Finanças", module: null },
  {
    key: "family-expenses",
    label: "Gastos familiares",
    href: "/gastos-familiares",
    group: "Finanças",
    module: "FAMILY_EXPENSES",
  },
];

/** As áreas que o usuário pode abrir, na ordem do menu. */
export function areasFor(modules: readonly AppModule[]) {
  return APP_AREAS.filter((area) => area.module === null || modules.includes(area.module));
}
