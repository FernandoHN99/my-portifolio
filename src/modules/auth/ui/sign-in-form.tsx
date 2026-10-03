"use client";

import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { authClient } from "@/modules/auth/auth-client";
import { Field, inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

type Mode = "sign-in" | "sign-up";

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou senha incorretos.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este e-mail. Entre com ela.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este e-mail. Entre com ela.",
  PASSWORD_TOO_SHORT: "A senha precisa de pelo menos 10 caracteres.",
  INVALID_EMAIL: "Digite um e-mail válido.",
};

function describe(error: { code?: string; message?: string; status?: number } | null) {
  if (!error) {
    return "Não foi possível entrar agora. Tente de novo.";
  }
  if (error.status === 429) {
    return "Muitas tentativas seguidas. Espere um pouco e tente de novo.";
  }
  return (error.code && MESSAGES[error.code]) ?? error.message ?? "Não foi possível entrar agora. Tente de novo.";
}

/**
 * Entrar ou criar conta (spec 050). Depois, volta ao endereço pedido. Os campos
 * não são controlados: um gerenciador de senhas pode preenchê-los antes de a
 * página ficar interativa, e o envio lê o que estiver neles.
 */
export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password || (mode === "sign-up" && !name)) {
      setError(mode === "sign-up" ? "Preencha nome, e-mail e senha." : "Preencha e-mail e senha.");
      return;
    }

    setPending(true);
    setError(null);

    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });

    if (result.error) {
      setError(describe(result.error));
      setPending(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  const signingUp = mode === "sign-up";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {signingUp ? (
        <Field label="Nome">
          <input
            aria-label="Nome"
            name="name"
            autoComplete="name"
            required
            className={inputClass}
          />
        </Field>
      ) : null}
      <Field label="E-mail">
        <input
          aria-label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className={inputClass}
        />
      </Field>
      <Field label="Senha">
        <input
          aria-label="Senha"
          name="password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          minLength={signingUp ? 10 : undefined}
          className={inputClass}
        />
      </Field>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${primaryButtonClass} w-full`}
      >
        {pending ? <CircleNotchIcon aria-hidden="true" size={14} className="animate-spin" /> : null}
        {signingUp ? "Criar conta" : "Entrar"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        {signingUp ? "Já tem conta?" : "Ainda não tem conta?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(signingUp ? "sign-in" : "sign-up");
            setError(null);
          }}
          className="font-medium text-primary outline-none hover:underline focus-visible:underline"
        >
          {signingUp ? "Entrar" : "Criar conta"}
        </button>
      </p>
    </form>
  );
}
