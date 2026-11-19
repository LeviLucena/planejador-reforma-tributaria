import type { ObjetoResultado, ResultadoOperacao } from "../../../server/src/dominio/tipos";

// A resposta do motor é profunda e sem tipagem rígida: estas leituras são tolerantes a campos ausentes.

export function ler(obj: unknown, ...caminho: string[]): string | undefined {
  let atual: unknown = obj;
  for (const chave of caminho) {
    if (typeof atual !== "object" || atual === null) return undefined;
    atual = (atual as Record<string, unknown>)[chave];
  }
  return typeof atual === "string" ? atual : undefined;
}

export interface ValoresItem {
  base?: string;
  cbs?: string;
  ibsUf?: string;
  ibsMun?: string;
  ibs?: string;
  is?: string;
  cClassTrib?: string;
}

export function valoresDoItem(o: ObjetoResultado): ValoresItem {
  const g = ["IBSCBS", "gIBSCBS"];
  const t = o.tribCalc;
  return {
    base: ler(t, ...g, "vBC"),
    cbs: ler(t, ...g, "gCBS", "vCBS"),
    ibsUf: ler(t, ...g, "gIBSUF", "vIBSUF"),
    ibsMun: ler(t, ...g, "gIBSMun", "vIBSMun"),
    ibs: ler(t, ...g, "vIBS"),
    is: ler(t, "IS", "vIS"),
    cClassTrib: ler(t, "IBSCBS", "cClassTrib"),
  };
}

export interface MemoriaItem {
  rotulo: string;
  texto: string;
}

/** memoriaCalculo aninhada em gIBSUF, gIBSMun e gCBS (e no IS, quando houver). */
export function memoriasDoItem(o: ObjetoResultado): MemoriaItem[] {
  const g = ["IBSCBS", "gIBSCBS"];
  const fontes: [string, string[]][] = [
    ["IBS estadual", [...g, "gIBSUF", "memoriaCalculo"]],
    ["IBS municipal", [...g, "gIBSMun", "memoriaCalculo"]],
    ["CBS", [...g, "gCBS", "memoriaCalculo"]],
    ["Imposto Seletivo", ["IS", "memoriaCalculo"]],
  ];
  const saida: MemoriaItem[] = [];
  for (const [rotulo, caminho] of fontes) {
    const texto = ler(o.tribCalc, ...caminho);
    if (texto !== undefined) saida.push({ rotulo, texto });
  }
  return saida;
}

export interface Totais {
  cbs?: string;
  ibs?: string;
  is?: string;
  base?: string;
}

export function totaisDe(r: ResultadoOperacao): Totais {
  const t = ["tribCalc"];
  return {
    cbs: ler(r.total, ...t, "IBSCBSTot", "gCBS", "vCBS"),
    ibs: ler(r.total, ...t, "IBSCBSTot", "gIBS", "vIBS"),
    is: ler(r.total, ...t, "ISTot", "vIS"),
    base: ler(r.total, ...t, "IBSCBSTot", "vBCIBSCBS"),
  };
}
