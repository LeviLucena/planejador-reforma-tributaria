import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "../dominio/erros.js";

export const MSG_INDISPONIVEL = "Motor oficial indisponível. Inicie-o com scripts\\iniciar-motores.ps1.";
export const TIMEOUT_MS = 30000;

export interface OpcoesRequisicao {
  /** true: a requisição carrega dados do chamador, então 4xx é culpa da entrada (ENTRADA_INVALIDA). */
  entradaDoChamador?: boolean;
  timeoutMs?: number;
}

function detalheDoMotor(texto: string): string {
  try {
    const j = JSON.parse(texto) as { detail?: unknown; errors?: { detail?: string }[] };
    const extras = (j.errors ?? []).map((e) => e.detail).filter(Boolean);
    const base =
      j.detail === undefined || j.detail === null
        ? "Requisição recusada pelo motor oficial."
        : typeof j.detail === "string"
          ? j.detail
          : JSON.stringify(j.detail);
    return extras.length ? `${base} ${extras.join("; ")}` : base;
  } catch {
    return texto.slice(0, 300) || "Requisição recusada pelo motor oficial.";
  }
}

export function indisponivel(): ErroDominio {
  return new ErroDominio(MOTOR_INDISPONIVEL, MSG_INDISPONIVEL, 503);
}

export async function requisitar(
  url: string,
  init?: RequestInit,
  opcoes: OpcoesRequisicao = {},
): Promise<string> {
  let res: Response;
  let texto: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(opcoes.timeoutMs ?? TIMEOUT_MS) });
    // Decodifica explicitamente como UTF-8 a partir dos bytes.
    texto = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  } catch {
    throw indisponivel();
  }
  if (res.status >= 200 && res.status < 300) return texto;
  if (opcoes.entradaDoChamador && res.status >= 400 && res.status < 500) {
    throw new ErroDominio(ENTRADA_INVALIDA, detalheDoMotor(texto), 400);
  }
  throw indisponivel();
}

/** Lê JSON de uma resposta 2xx; corpo malformado é falha do motor, não SyntaxError cru. */
export function lerJson<T>(texto: string): T {
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw indisponivel();
  }
}
