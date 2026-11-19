import type {
  AtividadeSimples,
  Fundamentacao,
  ObjetoResultado,
  OperacaoEntrada,
  ResultadoOperacao,
  SituacaoTributaria,
} from "../dominio/tipos.js";
import { lerJson, requisitar } from "./http.js";
import { listarAtividades } from "./simplesNacional.js";

export interface VersoesMotores {
  regimeRegular: string;
  simples: { app: string; db: string };
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
      const simples = lerJson<Versao>(
        await requisitar(`${cfg.urlSimples}/versao`, undefined, { timeoutMs }),
      );
      return {
        regimeRegular: `${reg.versaoApp}+${reg.versaoDb}`,
        simples: { app: simples.versaoApp, db: simples.versaoDb },
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
