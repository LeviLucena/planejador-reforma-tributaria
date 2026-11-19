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

export function criarConjunto(
  banco: Banco,
  c: { nome: string; vigenciaInicio: string; observacao?: string },
): number {
  const r = banco
    .prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio, observacao) VALUES (?, ?, ?)")
    .run(c.nome, c.vigenciaInicio, c.observacao ?? null);
  return Number(r.lastInsertRowid);
}

export function adicionarPremissa(banco: Banco, conjuntoId: number, p: PremissaEntrada): number {
  const nacional = p.tributo === "CBS" || p.tributo === "IS_ADVALOREM" || p.tributo === "IS_ADREM";
  if (nacional && (p.uf !== undefined || p.municipioIbge !== undefined)) {
    throw new ErroDominio(
      ENTRADA_INVALIDA,
      `A premissa ${p.tributo} é nacional: não aceita UF nem município.`,
      400,
    );
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
    if (codigo === "SQLITE_CONSTRAINT_CHECK") {
      throw new ErroDominio(
        ENTRADA_INVALIDA,
        "Premissa com origem oficial ou lei_transicao exige fonte_norma, fonte_artigo e consultado_em preenchidos (fonte obrigatória).",
        400,
      );
    }
    throw e;
  }
}
