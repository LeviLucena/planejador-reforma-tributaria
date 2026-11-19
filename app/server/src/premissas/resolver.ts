import type { Banco } from "../db/banco.js";
import { ErroDominio, PREMISSA_AUSENTE } from "../dominio/erros.js";
import type { AliquotasNominais } from "../dominio/tipos.js";
import type { OrigemPremissa } from "./repositorio.js";

interface Linha {
  aliquota: string;
  origem: OrigemPremissa;
}

export function resolverAliquotas(
  banco: Banco,
  conjuntoId: number,
  uf: string,
  municipioIbge: number,
  data: string,
): { aliquotas: AliquotasNominais; origens: Record<string, OrigemPremissa> } {
  const conjunto = banco
    .prepare("SELECT vigencia_inicio FROM conjunto_premissas WHERE id = ?")
    .get(conjuntoId) as { vigencia_inicio: string } | undefined;
  if (!conjunto) {
    throw new ErroDominio(PREMISSA_AUSENTE, `Conjunto de premissas ${conjuntoId} não encontrado.`, 422);
  }
  const dia = data.slice(0, 10);
  if (dia < conjunto.vigencia_inicio.slice(0, 10)) {
    throw new ErroDominio(
      PREMISSA_AUSENTE,
      `O conjunto de premissas ${conjuntoId} não está em vigor em ${dia} (vigência a partir de ${conjunto.vigencia_inicio}).`,
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

  const exigidas: [string, Linha | undefined][] = [
    ["CBS", cbs],
    ["IBS_UF", ibsUf],
    ["IBS_MUN", ibsMun],
  ];
  for (const [codigo, linha] of exigidas) {
    if (!linha) {
      throw new ErroDominio(
        PREMISSA_AUSENTE,
        `Premissa ${codigo} ausente para UF ${ufMaiuscula}, município ${mun}, conjunto ${conjuntoId}.`,
        422,
      );
    }
  }

  const origens: Record<string, OrigemPremissa> = {
    CBS: cbs!.origem,
    IBS_UF: ibsUf!.origem,
    IBS_MUN: ibsMun!.origem,
  };
  const aliquotas: AliquotasNominais = {
    cbs: cbs!.aliquota,
    ibsEstadual: ibsUf!.aliquota,
    ibsMunicipal: ibsMun!.aliquota,
  };

  const adv = buscar("IS_ADVALOREM", null, null);
  const adr = buscar("IS_ADREM", null, null);
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
