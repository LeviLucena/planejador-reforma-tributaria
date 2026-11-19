import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio } from "../dominio/erros.js";

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

export function adicionarPremissa(banco: Banco, conjuntoId: number, p: PremissaEntrada): number {
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
  if (p.origem !== "usuario") {
    const vazio = (v?: string) => v === undefined || v === null || v === "";
    const faltam = [
      vazio(p.fonteNorma) ? "fonteNorma" : null,
      vazio(p.fonteArtigo) ? "fonteArtigo" : null,
      vazio(p.consultadoEm) ? "consultadoEm" : null,
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
        p.fonteNorma ?? null,
        p.fonteArtigo ?? null,
        p.consultadoEm ?? null,
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
    throw e;
  }
}
