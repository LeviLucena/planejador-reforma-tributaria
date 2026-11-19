import type { Banco } from "../db/banco.js";
import type {
  AliquotasNominais,
  ItemEntrada,
  OperacaoEntrada,
  ResultadoOperacao,
} from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { resolverAliquotas } from "../premissas/resolver.js";

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

function faltaAlgumCampo(item: ItemEntrada): boolean {
  const a = item.aliquotasNominais;
  return !a || CAMPOS.some((c) => ausente(a[c]));
}

export async function simularOperacao(
  deps: { motores: MotoresPort; banco: Banco },
  req: RequisicaoSimulacao,
): Promise<RespostaSimulacao> {
  const { operacao, conjuntoPremissasId } = req;
  const origens: Record<string, string> = {};
  let itens: ItemEntrada[] = operacao.itens;

  if (operacao.itens.some(faltaAlgumCampo)) {
    const { aliquotas, origens: origensResolvidas } = resolverAliquotas(
      deps.banco,
      conjuntoPremissasId,
      operacao.uf,
      operacao.municipio,
      operacao.dhFatoGerador,
    );
    const usarOrigem = (chave: string) => {
      origens[chave] = origensResolvidas[chave]!;
    };
    const tributoDe = { cbs: "CBS", ibsEstadual: "IBS_UF", ibsMunicipal: "IBS_MUN" } as const;

    itens = operacao.itens.map((item) => {
      const proprias: Partial<AliquotasNominais> = item.aliquotasNominais ?? {};
      const nominais = { ...proprias } as AliquotasNominais;
      for (const campo of CAMPOS) {
        if (ausente(proprias[campo])) {
          nominais[campo] = aliquotas[campo];
          usarOrigem(tributoDe[campo]);
        }
      }
      const isResolvido = aliquotas.impostoSeletivo;
      const isProprio = proprias.impostoSeletivo;
      const semIsProprio = !isProprio || (ausente(isProprio.adValorem) && ausente(isProprio.adRem));
      if (item.impostoSeletivo && isResolvido && semIsProprio) {
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
