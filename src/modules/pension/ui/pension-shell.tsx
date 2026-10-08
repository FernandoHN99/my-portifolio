import type { ReactNode } from "react";

import { AppFrame } from "@/components/product/app-frame";

/** O menu compacto entra no título da página, como em Gastos familiares. */
export function PensionShell({ children }: { children: (menu: ReactNode | null) => ReactNode }) {
  return <AppFrame area="pension" header={() => null}>{children}</AppFrame>;
}
