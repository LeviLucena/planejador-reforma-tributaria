import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "../dominio/erros.js";

export const MSG_INDISPONIVEL = "Motor oficial indisponível. Inicie-o com scripts\iniciar-motores.ps1.";
export const TIMEOUT_MS = 30000;

function detalheDoMotor(texto: string): string {
  try {
    const j = JSON.parse(texto) as { detail?: string; errors?: { detail?: string }[] };
    const extras = (j.errors ?? []).map((e) => e.detail).filter(Boolean);
    const base = j.detail ?? "Requisição recusada pelo motor oficial.";
    return extras.length ? `${base} ${extras.join("; ")}` : base;
  } catch {
    return texto.slice(0, 300) || "Requisição recusada pelo motor oficial.";
  }
}

export async function requisitar(url: string, init?: RequestInit): Promise<string> {
  let res: Response;
  let texto: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Decodifica explicitamente como UTF-8 a partir dos bytes.
    texto = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  } catch {
    throw new ErroDominio(MOTOR_INDISPONIVEL, MSG_INDISPONIVEL, 503);
  }
  if (res.status >= 500) throw new ErroDominio(MOTOR_INDISPONIVEL, MSG_INDISPONIVEL, 503);
  if (res.status >= 400) throw new ErroDominio(ENTRADA_INVALIDA, detalheDoMotor(texto), 400);
  return texto;
}
