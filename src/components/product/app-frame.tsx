import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AreaMenuButton, AreaSidebar } from "@/components/product/area-nav";
import { TabViewport } from "@/components/product/tab-viewport";
import { getSessionAccess } from "@/modules/access/application/module-access";
import { areasFor, SIDEBAR_COOKIE, type AreaKey } from "@/modules/access/domain/areas";

/**
 * Moldura comum das áreas (spec 081). Com mais de uma área liberada, a barra
 * lateral fica à esquerda no computador e o cabeçalho recebe o botão do menu
 * hambúrguer (`menu`) para o celular; com uma só, a página é a de sempre.
 */
export async function AppFrame({
  area,
  header,
  children,
}: {
  area: AreaKey;
  /** Cabeçalho da área, que recebe o botão do menu quando há mais de uma área. */
  header: (menu: ReactNode | null) => ReactNode;
  children: ReactNode | ((menu: ReactNode | null) => ReactNode);
}) {
  const session = await getSessionAccess();
  const areas = session ? areasFor(session.access.modules) : [];

  if (!session || areas.length < 2) {
    return (
      <main className="app-canvas min-h-[100dvh] bg-background text-foreground">
        {header(null)}
        <TabViewport>{typeof children === "function" ? children(null) : children}</TabViewport>
      </main>
    );
  }

  const user = { name: session.user.name, email: session.user.email };
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <div className="bg-background lg:flex">
      <AreaSidebar areas={areas} active={area} user={user} collapsed={collapsed} />
      <main className="app-canvas min-h-[100dvh] min-w-0 flex-1 bg-background text-foreground">
        {header(<AreaMenuButton key="area-menu" areas={areas} active={area} user={user} className="lg:hidden" />)}
        <TabViewport>{typeof children === "function" ? children(<AreaMenuButton key="area-menu" areas={areas} active={area} user={user} className="lg:hidden" />) : children}</TabViewport>
      </main>
    </div>
  );
}
