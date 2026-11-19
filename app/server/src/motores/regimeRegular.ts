import type {
  AtividadeSimples,
  Fundamentacao,
  ObjetoResultado,
  OperacaoEntrada,
  ResultadoOperacao,
  SituacaoTributaria,
} from "../dominio/tipos.js";
import { requisitar } from "./http.js";
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
  return {
    async calcularOperacao(op) {
      const texto = await requisitar(`${cfg.urlRegimeRegular}/observabilidade/regime-geral`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(op),
      });
      return parseResultado(texto);
    },

    async versoes() {
      const reg = JSON.parse(await requisitar(`${cfg.urlRegimeRegular}/dados-abertos/versao`)) as {
        versaoApp: string;
        versaoDb: string;
      };
      const simples = JSON.parse(await requisitar(`${cfg.urlSimples}/versao`)) as {
        versaoApp: string;
        versaoDb: string;
      };
      return {
        regimeRegular: `${reg.versaoApp}+${reg.versaoDb}`,
        simples: { app: simples.versaoApp, db: simples.versaoDb },
      };
    },

    async listarSituacoes(data) {
      const texto = await requisitar(
        `${cfg.urlRegimeRegular}/dados-abertos/situacoes-tributarias/cbs-ibs?data=${encodeURIComponent(data)}`,
      );
      return JSON.parse(texto) as SituacaoTributaria[];
    },

    async listarFundamentacoes(data) {
      const texto = await requisitar(
        `${cfg.urlRegimeRegular}/dados-abertos/fundamentacoes-legais?data=${encodeURIComponent(data)}`,
      );
      return JSON.parse(texto) as Fundamentacao[];
    },

    listarAtividades: (data) => listarAtividades(cfg.urlSimples, data),
  };
}
