import { fileURLToPath } from "node:url";

const bancoPadrao = fileURLToPath(new URL("../data/reforma.db", import.meta.url));

/** Porta TCP: inteiro de 1 a 65535; qualquer outra coisa interrompe a inicialização. */
export function lerPorta(texto: string | undefined, padrao = 3000): number {
  if (texto === undefined) return padrao;
  const n = /^\d{1,5}$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`PORTA_APP inválida: "${texto}". Informe um número inteiro de 1 a 65535.`);
  }
  return n;
}

/** Devolve a mensagem de erro de PORTA_APP (uma linha) ou null se estiver válida. */
export function validarPortaApp(texto: string | undefined): string | null {
  try {
    lerPorta(texto);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export const config = {
  /** Lido sob demanda: o erro de PORTA_APP é tratado em index.ts, não na importação. */
  get portaApp(): number {
    return lerPorta(process.env.PORTA_APP);
  },
  urlRegimeRegular: process.env.URL_REGIME_REGULAR ?? "http://localhost:8080/api/calculadora",
  urlSimples: process.env.URL_SIMPLES ?? "http://localhost:8082/api",
  caminhoBanco: process.env.CAMINHO_BANCO ?? bancoPadrao,
};
