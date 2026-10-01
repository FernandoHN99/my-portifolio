export async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new QuoteHttpError(response.status, `O provedor respondeu com HTTP ${response.status}.`);
  }

  return response.json() as Promise<unknown>;
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

export function describeProviderError(error: unknown) {
  if (error instanceof QuoteHttpError) {
    return {
      code: error.statusCode === 429 ? "RATE_LIMITED" : "HTTP_ERROR",
      message: error.message,
    };
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return { code: "TIMEOUT", message: "O provedor excedeu o tempo limite." };
  }

  return {
    code: "INVALID_RESPONSE",
    message: error instanceof Error ? error.message : "Resposta inválida do provedor.",
  };
}
