import type {
  AtividadeSimples,
  Fundamentacao,
  ObjetoResultado,
  OperacaoEntrada,
  ResultadoOperacao,
  SituacaoTributaria,
} from "../dominio/tipos.js";
import { ErroDominio, MOTOR_INDISPONIVEL } from "../dominio/erros.js";
import { lerJson, requisitar } from "./http.js";
import { listarAtividades } from "./simplesNacional.js";

export interface VersoesMotores {
  regimeRegular: string;
  /** null quando o motor do Simples não respondeu (ele não participa do cálculo na Fase 1). */
  simples: { app: string; db: string } | null;
}

export interface MotoresPort {
  calcularOperacao(op: OperacaoEntrada): Promise<ResultadoOperacao>;
  versoes(): Promise<VersoesMotores>;
  listarSituacoes(data: string): Promise<SituacaoTributaria[]>;
  listarFundamentacoes(data: string): Promise<Fundamentacao[]>;
  listarAtividades(data: string): Promise<AtividadeSimples[]>;
}

export interface ConfigMotores {
  urlRegimeRegular: string;
  urlSimples: string;
  /** Tempo máximo por requisição ao motor (padrão 30000 ms). */
  timeoutMs?: number;
}

export function parseResultado(texto: string): ResultadoOperacao {
  return JSON.parse(texto) as ResultadoOperacao;
}

export function extrairMemoriaCalculo(objeto: ObjetoResultado): {
  ibsUf?: string;
  ibsMun?: string;
  cbs?: string;
} {
  const g = (objeto.tribCalc as any)?.IBSCBS?.gIBSCBS;
  const saida: { ibsUf?: string; ibsMun?: string; cbs?: string } = {};
  if (typeof g?.gIBSUF?.memoriaCalculo === "string") saida.ibsUf = g.gIBSUF.memoriaCalculo;
  if (typeof g?.gIBSMun?.memoriaCalculo === "string") saida.ibsMun = g.gIBSMun.memoriaCalculo;
  if (typeof g?.gCBS?.memoriaCalculo === "string") saida.cbs = g.gCBS.memoriaCalculo;
  return saida;
}

export function criarMotores(cfg: ConfigMotores): MotoresPort {
  const timeoutMs = cfg.timeoutMs;
  return {
    async calcularOperacao(op) {
      const texto = await requisitar(
        `${cfg.urlRegimeRegular}/observabilidade/regime-geral`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(op),
        },
        { entradaDoChamador: true, timeoutMs },
      );
      return lerJson<ResultadoOperacao>(texto);
    },

    async versoes() {
      type Versao = { versaoApp: string; versaoDb: string };
      const reg = lerJson<Versao>(
        await requisitar(`${cfg.urlRegimeRegular}/dados-abertos/versao`, undefined, { timeoutMs }),
      );
      // O motor do Simples não calcula nada na Fase 1: fora do ar, a versão dele fica null
      // (quem grava registra "indisponivel"); o regime regular fora do ar continua sendo erro.
      let simples: Versao | null = null;
      try {
        simples = lerJson<Versao>(await requisitar(`${cfg.urlSimples}/versao`, undefined, { timeoutMs }));
      } catch (e) {
        if (!(e instanceof ErroDominio && e.codigo === MOTOR_INDISPONIVEL)) throw e;
      }
      return {
        regimeRegular: `${reg.versaoApp}+${reg.versaoDb}`,
        simples: simples ? { app: simples.versaoApp, db: simples.versaoDb } : null,
      };
    },

    async listarSituacoes(data) {
      const texto = await requisitar(
        `${cfg.urlRegimeRegular}/dados-abertos/situacoes-tributarias/cbs-ibs?data=${encodeURIComponent(data)}`,
        undefined,
        { timeoutMs },
      );
      return lerJson<SituacaoTributaria[]>(texto);
    },

    async listarFundamentacoes(data) {
      const texto = await requisitar(
        `${cfg.urlRegimeRegular}/dados-abertos/fundamentacoes-legais?data=${encodeURIComponent(data)}`,
        undefined,
        { timeoutMs },
      );
      return lerJson<Fundamentacao[]>(texto);
    },

    listarAtividades: (data) => listarAtividades(cfg.urlSimples, data, timeoutMs),
  };
}
