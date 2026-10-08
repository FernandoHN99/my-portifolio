import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 300;

export type FetchJsonOptions = {
  /** Tempo de cada tentativa; o padrão é 12 s. */
  timeoutMs?: number;
  /**
   * Tentativas no total. Só falha passageira repete: tempo esgotado, rede e
   * HTTP 5xx. Recusa do provedor (4xx, como 429 e 451) não repete.
   */
  attempts?: number;
};

export async function fetchJson(url: URL, init?: RequestInit, options: FetchJsonOptions = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, attempts = 1 } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new QuoteHttpError(response.status, `O provedor respondeu com HTTP ${response.status}.`);
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (attempt >= attempts || !isTransient(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
}

function isTransient(error: unknown) {
  if (error instanceof QuoteHttpError) {
    return error.statusCode >= 500;
  }

  // Tempo esgotado (TimeoutError) e falha de conexão (TypeError do fetch).
  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}

export class QuoteHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "QuoteHttpError";
  }
}

// Resposta válida em que o provedor recusa a consulta, como o aviso de limite de
// uso do Alpha Vantage, que vem com HTTP 200.
export class ProviderRefusalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderRefusalError";
  }
}

export function describeProviderError(error: unknown) {
  if (error instanceof ProviderRefusalError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof QuoteHttpError) {
    if (error.statusCode === 451) {
      return { code: "REGION_BLOCKED", message: "O provedor bloqueia a região do servidor (HTTP 451)." };
    }

    return {
      code: error.statusCode === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
      message:
        error.statusCode === 429
          ? "O provedor recusou por excesso de consultas (HTTP 429)."
          : error.message,
    };
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return { code: "TIMEOUT", message: "O provedor excedeu o tempo limite." };
  }

  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return { code: "INVALID_RESPONSE", message: "O provedor respondeu em um formato inesperado." };
  }

  if (error instanceof TypeError) {
    return { code: "NETWORK_ERROR", message: "Não foi possível conectar ao provedor." };
  }

  return {
    code: "INVALID_RESPONSE",
    message: error instanceof Error ? error.message : "Resposta inválida do provedor.",
  };
}
