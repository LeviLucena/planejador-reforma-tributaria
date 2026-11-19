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

/** "00000000000000" (14 dígitos) -> "00.000.000/0000-00", só para exibição; qualquer outro texto volta sem alteração. */
export function formatarCnpj(digitos: string): string {
  const m = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/.exec(digitos);
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : digitos;
}

/** "2026-11-18" ou "2026-11-18T12:00:00.000Z" -> "18/11/2026" (por texto, sem fuso). */
export function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const FORMATO_DATA_BRASILIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const FORMATO_DATA_HORA_BRASILIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Instante ISO com horário (ex.: validado_em em UTC) -> data civil em Brasília; só-data passa como está. */
export function dataBrasilia(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dataBR(iso);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FORMATO_DATA_BRASILIA.format(d);
}

/** Instante ISO -> data e hora em Brasília (ex.: "18/11/2026, 12:30"); texto inválido volta sem alteração. */
export function dataHoraBrasilia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FORMATO_DATA_HORA_BRASILIA.format(d);
}
