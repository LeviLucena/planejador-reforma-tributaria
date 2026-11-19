// Formatação por texto: valores decimais do motor nunca passam por Number (preserva os dígitos exatos).

const RE_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** "1465.00" -> "1.465,00"; "56.76" -> "56,76". Texto que não é decimal volta sem alteração. */
export function formatarDecimalBR(valor: string): string {
  const m = RE_DECIMAL.exec(valor);
  if (!m) return valor;
  const [, sinal, inteiros, fracao] = m;
  const semZeros = inteiros!.replace(/^0+(?=\d)/, ""); // "0001" -> "1", mas "0" e "0.50" mantêm um zero
  const comMilhar = semZeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}${comMilhar}${fracao === undefined ? "" : `,${fracao}`}`;
}

/**
 * "2027-03-10T10:00" (datetime-local) -> "2027-03-10T10:00:00-03:00".
 * O fato gerador é sempre enviado no horário de Brasília (-03:00), qualquer que seja o fuso do navegador.
 */
export function paraIsoBrasilia(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}-03:00`;
}
