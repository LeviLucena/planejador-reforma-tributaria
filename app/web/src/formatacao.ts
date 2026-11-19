// Formatação por texto: valores decimais do motor nunca passam por Number (preserva os dígitos exatos).

const RE_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/** "1465.00" -> "1.465,00"; "56.76" -> "56,76". Texto que não é decimal volta sem alteração. */
export function formatarDecimalBR(valor: string): string {
  const m = RE_DECIMAL.exec(valor);
  if (!m) return valor;
  const [, sinal, inteiros, fracao] = m;
  const comMilhar = inteiros!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}${comMilhar}${fracao === undefined ? "" : `,${fracao}`}`;
}

/** "2027-03-10T10:00" (datetime-local) + deslocamento -> "2027-03-10T10:00:00-03:00". */
export function paraIsoComDeslocamento(local: string, deslocamentoMin?: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  // getTimezoneOffset: minutos a OESTE de UTC (São Paulo = 180); o ISO usa o sinal inverso.
  const oeste = deslocamentoMin ?? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTimezoneOffset();
  const leste = -oeste;
  const sinal = leste < 0 ? "-" : "+";
  const abs = Math.abs(leste);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${sinal}${hh}:${mm}`;
}
