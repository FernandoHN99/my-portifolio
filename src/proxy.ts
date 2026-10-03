import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Desvio otimista do login (spec 050): sem o cookie da sessão, as páginas levam
// à entrada, guardando o endereço pedido, e as rotas de API respondem 401. O
// cookie só indica uma sessão; quem confere de verdade é o servidor, em cada
// página, ação e rota (src/modules/auth/session.ts).
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "Entre no aplicativo para continuar." }, { status: 401 });
  }

  const target = request.nextUrl.clone();
  target.pathname = "/entrar";
  target.search = "";

  if (pathname !== "/" || search) {
    target.searchParams.set("para", `${pathname}${search}`);
  }

  return NextResponse.redirect(target);
}

export const config = {
  // Fora do desvio: as rotas do login, a página de entrada, a saúde do app e os
  // arquivos estáticos.
  matcher: ["/((?!api/auth|api/health|entrar|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
