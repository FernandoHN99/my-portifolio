import { createAuthClient } from "better-auth/react";

// Cliente do login para a interface (spec 050). Sem `baseURL`, usa o endereço
// aberto no navegador, que muda a cada deploy na Vercel.
export const authClient = createAuthClient();
