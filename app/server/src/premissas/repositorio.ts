import type { Banco } from "../db/banco.js";
import { CONJUNTO_VALIDADO, ENTRADA_INVALIDA, ErroDominio, NAO_ENCONTRADO } from "../dominio/erros.js";
import { UFS } from "../dominio/ufs.js";

export type TributoPremissa = "CBS" | "IBS_UF" | "IBS_MUN" | "IS_ADVALOREM" | "IS_ADREM";
export type OrigemPremissa = "oficial" | "lei_transicao" | "usuario";

export interface PremissaEntrada {
  tributo: TributoPremissa;
  uf?: string;
  municipioIbge?: number;
  aliquota: string;
  origem: OrigemPremissa;
  fonteNorma?: string;
  fonteArtigo?: string;
  consultadoEm?: string;
}

const TRIBUTOS: readonly string[] = ["CBS", "IBS_UF", "IBS_MUN", "IS_ADVALOREM", "IS_ADREM"];
const ORIGENS: readonly string[] = ["oficial", "lei_transicao", "usuario"];

/** Valida 'YYYY-MM-DD' (opcionalmente seguido de horário) como data real; devolve só a data. */
export function validarDataIso(valor: string, campo: string): string {
  const m = typeof valor === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(valor) : null;
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }
  throw new ErroDominio(
    ENTRADA_INVALIDA,
    `${campo} inválida: esperado data ISO válida (AAAA-MM-DD), recebido "${String(valor)}".`,
    400,
  );
}

export function criarConjunto(
  banco: Banco,
  c: { nome: string; vigenciaInicio: string; vigenciaFim?: string; observacao?: string },
): number {
  const inicio = validarDataIso(c.vigenciaInicio, "vigenciaInicio");
  if (c.vigenciaFim !== undefined) {
    const fim = validarDataIso(c.vigenciaFim, "vigenciaFim");
    if (fim < inicio) {
      throw new ErroDominio(
        ENTRADA_INVALIDA,
        `vigenciaFim (${fim}) não pode ser anterior a vigenciaInicio (${inicio}).`,
        400,
      );
    }
  }
  const r = banco
    .prepare(
      "INSERT INTO conjunto_premissas (nome, vigencia_inicio, vigencia_fim, observacao) VALUES (?, ?, ?, ?)",
    )
    .run(c.nome, c.vigenciaInicio, c.vigenciaFim ?? null, c.observacao ?? null);
  return Number(r.lastInsertRowid);
}

function invalida(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

/** Alíquota em texto decimal, de 0 a 100 (%), comparada como texto: nunca passa por Number. */
function validarAliquota(a: unknown): void {
  const m = typeof a === "string" ? /^(\d+)(?:\.(\d+))?$/.exec(a) : null;
  if (!m) invalida(`aliquota inválida: esperado texto decimal (ex.: "8.8"), recebido ${JSON.stringify(a)}.`);
  const inteiro = m[1]!.replace(/^0+(?=\d)/, "");
  const fracao = m[2] ?? "";
  const passa = inteiro.length > 3 || (inteiro.length === 3 && (inteiro > "100" || (inteiro === "100" && /[1-9]/.test(fracao))));
  if (passa) invalida(`aliquota inválida: ${a as string} é maior que 100.`);
}

export function adicionarPremissa(banco: Banco, conjuntoId: number, p: PremissaEntrada): number {
  // Conjunto validado é imutável: o que a pessoa conferiu não pode mudar depois (duplique para editar).
  const atual = banco.prepare("SELECT validado_por FROM conjunto_premissas WHERE id = ?").get(conjuntoId) as
    | { validado_por: string | null }
    | undefined;
  if (atual && atual.validado_por !== null) {
    throw new ErroDominio(
      CONJUNTO_VALIDADO,
      "Este conjunto já foi validado e não pode ser alterado. Duplique-o para criar uma versão editável.",
      409,
    );
  }
  if (!TRIBUTOS.includes(p.tributo)) {
    throw new ErroDominio(ENTRADA_INVALIDA, `tributo inválido: "${String(p.tributo)}".`, 400);
  }
  if (!ORIGENS.includes(p.origem)) {
    throw new ErroDominio(ENTRADA_INVALIDA, `origem inválida: "${String(p.origem)}".`, 400);
  }
  const nacional = p.tributo === "CBS" || p.tributo === "IS_ADVALOREM" || p.tributo === "IS_ADREM";
  if (nacional && (p.uf !== undefined || p.municipioIbge !== undefined)) {
    throw new ErroDominio(
      ENTRADA_INVALIDA,
      `A premissa ${p.tributo} é nacional: não aceita UF nem município.`,
      400,
    );
  }
  if (p.uf !== undefined && (typeof p.uf !== "string" || !UFS.has(p.uf.toUpperCase()))) {
    invalida(`uf inválida: esperada uma das 27 siglas de UF, recebido ${JSON.stringify(p.uf)}.`);
  }
  if (
    p.municipioIbge !== undefined &&
    (typeof p.municipioIbge !== "number" || !Number.isInteger(p.municipioIbge) || !/^\d{7}$/.test(String(p.municipioIbge)))
  ) {
    invalida(`municipioIbge inválido: esperado número inteiro IBGE de 7 dígitos, recebido ${JSON.stringify(p.municipioIbge)}.`);
  }
  if (p.tributo === "IBS_UF" && p.municipioIbge !== undefined) {
    invalida("A premissa IBS_UF não aceita municipioIbge (use apenas uf).");
  }
  if (p.tributo === "IBS_MUN" && p.municipioIbge !== undefined && p.uf === undefined) {
    invalida("A premissa IBS_MUN com municipioIbge exige também a uf.");
  }
  validarAliquota(p.aliquota);
  // Campos de fonte: chamadores JSON não são tipados; texto só de espaços conta como ausente.
  const fonte = (campo: "fonteNorma" | "fonteArtigo" | "consultadoEm"): string | undefined => {
    const v: unknown = p[campo];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") invalida(`${campo} inválido: esperado texto, recebido ${JSON.stringify(v)}.`);
    const t = v.trim();
    return t === "" ? undefined : t;
  };
  const fonteNorma = fonte("fonteNorma");
  const fonteArtigo = fonte("fonteArtigo");
  const consultadoEm = fonte("consultadoEm");
  if (consultadoEm !== undefined) validarDataIso(consultadoEm, "consultadoEm");
  if (p.origem !== "usuario") {
    const faltam = [
      fonteNorma === undefined ? "fonteNorma" : null,
      fonteArtigo === undefined ? "fonteArtigo" : null,
      consultadoEm === undefined ? "consultadoEm" : null,
    ].filter((x): x is string => x !== null);
    if (faltam.length > 0) {
      throw new ErroDominio(
        ENTRADA_INVALIDA,
        `Premissa com origem ${p.origem} exige fonte obrigatória; faltando: ${faltam.join(", ")}.`,
        400,
      );
    }
  }
  try {
    const r = banco
      .prepare(
        `INSERT INTO premissa_aliquota
           (conjunto_id, tributo, uf, municipio_ibge, aliquota, origem, fonte_norma, fonte_artigo, consultado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        conjuntoId,
        p.tributo,
        p.uf === undefined ? null : p.uf.toUpperCase(),
        p.municipioIbge === undefined ? null : String(p.municipioIbge),
        p.aliquota,
        p.origem,
        fonteNorma ?? null,
        fonteArtigo ?? null,
        consultadoEm ?? null,
      );
    return Number(r.lastInsertRowid);
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    if (codigo === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new ErroDominio(
        ENTRADA_INVALIDA,
        `Já existe uma premissa ${p.tributo} para uf ${p.uf?.toUpperCase() ?? "(nacional)"}, município ${p.municipioIbge ?? "(nenhum)"} no conjunto ${conjuntoId}.`,
        400,
      );
    }
    if (codigo === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      throw new ErroDominio(NAO_ENCONTRADO, `Conjunto de premissas ${conjuntoId} não encontrado.`, 404);
    }
    throw e;
  }
}

export interface ConjuntoResumo {
  id: number;
  nome: string;
  vigenciaInicio: string;
  vigenciaFim: string | null;
  observacao: string | null;
  validadoPor: string | null;
  validadoEm: string | null;
  linhas: number;
}

/** Lista os conjuntos de premissas (somente leitura), com a contagem de linhas de cada um. */
export function listarConjuntos(banco: Banco): ConjuntoResumo[] {
  const linhas = banco
    .prepare(
      `SELECT c.id, c.nome, c.vigencia_inicio, c.vigencia_fim, c.observacao, c.validado_por, c.validado_em,
              (SELECT COUNT(*) FROM premissa_aliquota p WHERE p.conjunto_id = c.id) AS linhas
         FROM conjunto_premissas c ORDER BY c.id`,
    )
    .all() as {
    id: number;
    nome: string;
    vigencia_inicio: string;
    vigencia_fim: string | null;
    observacao: string | null;
    validado_por: string | null;
    validado_em: string | null;
    linhas: number;
  }[];
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    vigenciaInicio: l.vigencia_inicio,
    vigenciaFim: l.vigencia_fim,
    observacao: l.observacao,
    validadoPor: l.validado_por,
    validadoEm: l.validado_em,
    linhas: Number(l.linhas),
  }));
}

export interface LinhaPremissa {
  id: number;
  tributo: TributoPremissa;
  uf: string | null;
  municipioIbge: string | null;
  aliquota: string;
  origem: OrigemPremissa;
  fonteNorma: string | null;
  fonteArtigo: string | null;
  consultadoEm: string | null;
}

/** Um conjunto pelo id (mesmo formato de listarConjuntos); 404 se não existir. */
export function obterConjunto(banco: Banco, id: number): ConjuntoResumo {
  const c = listarConjuntos(banco).find((x) => x.id === id);
  if (!c) throw new ErroDominio(NAO_ENCONTRADO, `Conjunto de premissas ${id} não encontrado.`, 404);
  return c;
}

/** Linhas de um conjunto, em ordem de id; a alíquota volta exatamente como gravada (texto). */
export function listarLinhas(banco: Banco, conjuntoId: number): LinhaPremissa[] {
  obterConjunto(banco, conjuntoId);
  const rs = banco
    .prepare(
      `SELECT id, tributo, uf, municipio_ibge, aliquota, origem, fonte_norma, fonte_artigo, consultado_em
         FROM premissa_aliquota WHERE conjunto_id = ? ORDER BY id`,
    )
    .all(conjuntoId) as Record<string, string | number | null>[];
  return rs.map((l) => ({
    id: Number(l.id),
    tributo: l.tributo as TributoPremissa,
    uf: l.uf as string | null,
    municipioIbge: l.municipio_ibge === null ? null : String(l.municipio_ibge),
    aliquota: String(l.aliquota),
    origem: l.origem as OrigemPremissa,
    fonteNorma: l.fonte_norma as string | null,
    fonteArtigo: l.fonte_artigo as string | null,
    consultadoEm: l.consultado_em as string | null,
  }));
}

/**
 * Ação explícita do usuário: registra quem validou e quando (ISO agora). Validar de novo
 * SOBRESCREVE validado_por/validado_em (vale a última validação).
 */
export function validarConjunto(banco: Banco, id: number, validadoPor: string): ConjuntoResumo {
  const nome = typeof validadoPor === "string" ? validadoPor.trim() : "";
  if (nome === "" || nome.length > 200) {
    invalida("validadoPor inválido: informe o nome de quem validou (texto não vazio, até 200 caracteres).");
  }
  const r = banco
    .prepare("UPDATE conjunto_premissas SET validado_por = ?, validado_em = ? WHERE id = ?")
    .run(nome, new Date().toISOString(), id);
  if (r.changes === 0) throw new ErroDominio(NAO_ENCONTRADO, `Conjunto de premissas ${id} não encontrado.`, 404);
  return obterConjunto(banco, id);
}

/**
 * Copia um conjunto (e todas as suas linhas, campos de fonte idênticos) para um novo conjunto NÃO validado,
 * numa única transação. O nome vira "<nome> (cópia)", com número se já existir.
 */
export function duplicarConjunto(banco: Banco, id: number): number {
  return banco.transaction(() => {
    const orig = obterConjunto(banco, id);
    const nomes = new Set(listarConjuntos(banco).map((c) => c.nome));
    let nome = `${orig.nome} (cópia)`;
    for (let n = 2; nomes.has(nome); n++) nome = `${orig.nome} (cópia ${n})`;
    const novo = Number(
      banco
        .prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio, vigencia_fim, observacao) VALUES (?, ?, ?, ?)")
        .run(nome, orig.vigenciaInicio, orig.vigenciaFim, orig.observacao).lastInsertRowid,
    );
    banco
      .prepare(
        `INSERT INTO premissa_aliquota
           (conjunto_id, tributo, uf, municipio_ibge, aliquota, origem, fonte_norma, fonte_artigo, consultado_em)
         SELECT ?, tributo, uf, municipio_ibge, aliquota, origem, fonte_norma, fonte_artigo, consultado_em
           FROM premissa_aliquota WHERE conjunto_id = ? ORDER BY id`,
      )
      .run(novo, id);
    return novo;
  })();
}
