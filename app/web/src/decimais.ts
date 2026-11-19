// Leitura ÚNICA dos números digitados (simulador e premissas). Só texto: nunca passa por Number.
// Aceita vírgula ou ponto como separador decimal ("8,8", "0.05") e ponto como milhar SÓ com
// vírgula decimal ("1.200,50"). "1.200" sozinho é recusado: no Brasil é mil e duzentos, mas
// seria lido como 1,2.

export type LeituraDecimal = { ok: true; valor: string } | { ok: false; erro: string };

const SIMPLES = /^(\d+)(?:[.,](\d+))?$/;
const MILHAR_COM_VIRGULA = /^(\d{1,3}(?:\.\d{3})+),(\d+)$/;
const SO_MILHAR_COM_PONTO = /^\d{1,3}(?:\.\d{3})+$/;

export const ERRO_NAO_NUMERICO = "use apenas números (ex.: 100,50).";

export function lerDecimal(texto: string): LeituraDecimal {
  const v = texto.trim();
  if (SO_MILHAR_COM_PONTO.test(v)) {
    return { ok: false, erro: `Use vírgula para decimais (ex.: 1200,00). "${v}" é ambíguo.` };
  }
  const milhar = MILHAR_COM_VIRGULA.exec(v);
  if (milhar) return { ok: true, valor: `${milhar[1]!.split(".").join("")}.${milhar[2]}` };
  const m = SIMPLES.exec(v);
  if (m) return { ok: true, valor: m[2] === undefined ? m[1]! : `${m[1]}.${m[2]}` };
  return { ok: false, erro: ERRO_NAO_NUMERICO };
}
