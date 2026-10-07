import type { ReactNode } from "react";

import { AppFrame } from "@/components/product/app-frame";

/** O menu compacto entra no título da página, sem faixa fixa (spec 087). */
export function FamilyShell({ children }: { children: (menu: ReactNode | null) => ReactNode }) {
  return <AppFrame area="family-expenses" header={() => null}>{children}</AppFrame>;
}
