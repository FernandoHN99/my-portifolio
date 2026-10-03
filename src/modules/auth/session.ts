import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/modules/auth/auth";

export type SessionUser = { id: string; name: string; email: string };

/**
 * Usuário da sessão do pedido, ou nulo. O cache do React lê uma vez por
 * renderização; nas ações e rotas, a sessão confirmada vem do cookie assinado
 * (5 minutos) sem consultar o banco.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
  } catch (error) {
    console.error("Não foi possível ler a sessão.", error);
    return null;
  }
});

/**
 * Usuário da sessão; sem ela, leva à página de entrada. O `proxy.ts` já desvia
 * quem não tem o cookie; isto cobre a sessão vencida ou revogada.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/entrar");
  }

  return user;
}

/** Para as rotas de API: a resposta 401 quando não há sessão. */
export async function rejectWithoutSession(): Promise<Response | null> {
  return (await getSessionUser())
    ? null
    : Response.json({ message: "Entre no aplicativo para continuar." }, { status: 401 });
}
