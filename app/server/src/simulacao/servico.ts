import type { Banco } from "../db/banco.js";
import type {
  AliquotasNominais,
  ItemEntrada,
  OperacaoEntrada,
  ResultadoOperacao,
} from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { resolverAliquotas, type TributoExigivel } from "../premissas/resolver.js";

export interface RequisicaoSimulacao {
  operacao: OperacaoEntrada;
  conjuntoPremissasId: number;
}

export interface RespostaSimulacao {
  resultado: ResultadoOperacao;
  entradaEnviada: OperacaoEntrada;
  origensPremissas: Record<string, string>;
}

const ausente = (v: unknown) => v === undefined || v === null;
const CAMPOS = ["cbs", "ibsEstadual", "ibsMunicipal"] as const;
const TRIBUTO_DO_CAMPO = { cbs: "CBS", ibsEstadual: "IBS_UF", ibsMunicipal: "IBS_MUN" } as const;

/** Item com grupo de Imposto Seletivo e sem alíquota de IS própria (ad valorem nem ad rem). */
function precisaDeIs(item: ItemEntrada): boolean {
  if (!item.impostoSeletivo) return false;
  const proprio = item.aliquotasNominais?.impostoSeletivo;
  return !proprio || (ausente(proprio.adValorem) && ausente(proprio.adRem));
}

/** Tributos que algum item não traz: só esses são exigidos do conjunto de premissas. */
function tributosFaltantes(itens: ItemEntrada[]): TributoExigivel[] {
  const faltam = new Set<TributoExigivel>();
  for (const item of itens) {
    const a: Partial<AliquotasNominais> = item.aliquotasNominais ?? {};
    for (const campo of CAMPOS) if (ausente(a[campo])) faltam.add(TRIBUTO_DO_CAMPO[campo]);
    if (precisaDeIs(item)) faltam.add("IS");
  }
  return [...faltam];
}

export async function simularOperacao(
  deps: { motores: MotoresPort; banco: Banco },
  req: RequisicaoSimulacao,
): Promise<RespostaSimulacao> {
  const { operacao, conjuntoPremissasId } = req;
  const origens: Record<string, string> = {};
  let itens: ItemEntrada[] = operacao.itens;

  const exigir = tributosFaltantes(operacao.itens);
  if (exigir.length > 0) {
    // Recusa (PREMISSA_AUSENTE) antes de chamar o motor se o conjunto não tem o que falta.
    const { aliquotas, origens: origensResolvidas } = resolverAliquotas(
      deps.banco,
      conjuntoPremissasId,
      operacao.uf,
      operacao.municipio,
      operacao.dhFatoGerador,
      { exigir },
    );
    const usarOrigem = (chave: string) => {
      origens[chave] = origensResolvidas[chave]!;
    };

    itens = operacao.itens.map((item) => {
      const proprias: Partial<AliquotasNominais> = item.aliquotasNominais ?? {};
      const nominais = { ...proprias } as AliquotasNominais;
      for (const campo of CAMPOS) {
        if (ausente(proprias[campo])) {
          nominais[campo] = aliquotas[campo]!;
          usarOrigem(TRIBUTO_DO_CAMPO[campo]);
        }
      }
      const isResolvido = aliquotas.impostoSeletivo;
      if (precisaDeIs(item) && isResolvido) {
        nominais.impostoSeletivo = { ...isResolvido };
        if (!ausente(isResolvido.adValorem)) usarOrigem("IS_ADVALOREM");
        if (!ausente(isResolvido.adRem)) usarOrigem("IS_ADREM");
      }
      return { ...item, aliquotasNominais: nominais };
    });
  }

  const entradaEnviada: OperacaoEntrada = { ...operacao, itens };
  const resultado = await deps.motores.calcularOperacao(entradaEnviada);
  return { resultado, entradaEnviada, origensPremissas: origens };
}
