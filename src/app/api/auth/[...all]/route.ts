import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/modules/auth/auth";

// Rotas do Better Auth (spec 050): entrar, criar conta, sair e a sessão.
export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
