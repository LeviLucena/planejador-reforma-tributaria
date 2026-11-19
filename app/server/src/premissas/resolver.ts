import type { Banco } from "../db/banco.js";
import { ErroDominio, PREMISSA_AUSENTE } from "../dominio/erros.js";
import type { AliquotasNominais } from "../dominio/tipos.js";
import { validarDataIso, type OrigemPremissa } from "./repositorio.js";

interface Linha {
  aliquota: string;
  origem: OrigemPremissa;
}

/** IS = IS_ADVALOREM ou IS_ADREM (basta uma das duas linhas). */
export type TributoExigivel = "CBS" | "IBS_UF" | "IBS_MUN" | "IS";

export interface OpcoesResolucao {
  /**
   * Tributos que precisam existir no conjunto (padrão: CBS, IBS_UF e IBS_MUN).
   * Um tributo que os itens já trazem não deve ser exigido: quem chama passa só o que falta.
   */
  exigir?: TributoExigivel[];
}

/**
 * Resolve as alíquotas do conjunto para UF/município/data. Devolve tudo o que o conjunto
 * tem; recusa (PREMISSA_AUSENTE) só os tributos de opcoes.exigir que faltarem.
 */
export function resolverAliquotas(
  banco: Banco,
  conjuntoId: number,
  uf: string,
  municipioIbge: number,
  data: string,
  opcoes: OpcoesResolucao = {},
): { aliquotas: Partial<AliquotasNominais>; origens: Record<string, OrigemPremissa> } {
  const dia = validarDataIso(data, "data");
  const conjunto = banco
    .prepare("SELECT vigencia_inicio, vigencia_fim FROM conjunto_premissas WHERE id = ?")
    .get(conjuntoId) as { vigencia_inicio: string; vigencia_fim: string | null } | undefined;
  if (!conjunto) {
    throw new ErroDominio(PREMISSA_AUSENTE, `Conjunto de premissas ${conjuntoId} não encontrado.`, 422);
  }
  if (dia < conjunto.vigencia_inicio.slice(0, 10)) {
    throw new ErroDominio(
      PREMISSA_AUSENTE,
      `O conjunto de premissas ${conjuntoId} não está em vigor em ${dia} (vigência a partir de ${conjunto.vigencia_inicio}).`,
      422,
    );
  }
  if (conjunto.vigencia_fim !== null && dia > conjunto.vigencia_fim.slice(0, 10)) {
    throw new ErroDominio(
      PREMISSA_AUSENTE,
      `O conjunto de premissas ${conjuntoId} não está mais em vigor em ${dia} (vigência terminou em ${conjunto.vigencia_fim}).`,
      422,
    );
  }
  const ufMaiuscula = uf.toUpperCase();
  const mun = String(municipioIbge);

  const buscar = (tributo: string, u: string | null, m: string | null): Linha | undefined =>
    banco
      .prepare(
        `SELECT aliquota, origem FROM premissa_aliquota
          WHERE conjunto_id = ? AND tributo = ? AND uf IS ? AND municipio_ibge IS ?
          ORDER BY id DESC LIMIT 1`,
      )
      .get(conjuntoId, tributo, u, m) as Linha | undefined;

  const cbs = buscar("CBS", null, null);
  const ibsUf = buscar("IBS_UF", ufMaiuscula, null) ?? buscar("IBS_UF", null, null);
  const ibsMun =
    buscar("IBS_MUN", ufMaiuscula, mun) ??
    buscar("IBS_MUN", ufMaiuscula, null) ??
    buscar("IBS_MUN", null, null);
  const adv = buscar("IS_ADVALOREM", null, null);
  const adr = buscar("IS_ADREM", null, null);

  const exigir = new Set<TributoExigivel>(opcoes.exigir ?? ["CBS", "IBS_UF", "IBS_MUN"]);
  const presentes: [TributoExigivel, boolean][] = [
    ["CBS", cbs !== undefined],
    ["IBS_UF", ibsUf !== undefined],
    ["IBS_MUN", ibsMun !== undefined],
    ["IS", adv !== undefined || adr !== undefined],
  ];
  for (const [codigo, existe] of presentes) {
    if (exigir.has(codigo) && !existe) {
      const nome = codigo === "IS" ? "IS (IS_ADVALOREM ou IS_ADREM)" : codigo;
      throw new ErroDominio(
        PREMISSA_AUSENTE,
        `Premissa ${nome} ausente para UF ${ufMaiuscula}, município ${mun}, conjunto ${conjuntoId}.`,
        422,
      );
    }
  }

  const origens: Record<string, OrigemPremissa> = {};
  const aliquotas: Partial<AliquotasNominais> = {};
  if (cbs) {
    aliquotas.cbs = cbs.aliquota;
    origens.CBS = cbs.origem;
  }
  if (ibsUf) {
    aliquotas.ibsEstadual = ibsUf.aliquota;
    origens.IBS_UF = ibsUf.origem;
  }
  if (ibsMun) {
    aliquotas.ibsMunicipal = ibsMun.aliquota;
    origens.IBS_MUN = ibsMun.origem;
  }
  if (adv || adr) {
    aliquotas.impostoSeletivo = {};
    if (adv) {
      aliquotas.impostoSeletivo.adValorem = adv.aliquota;
      origens.IS_ADVALOREM = adv.origem;
    }
    if (adr) {
      aliquotas.impostoSeletivo.adRem = adr.aliquota;
      origens.IS_ADREM = adr.origem;
    }
  }
  return { aliquotas, origens };
}
