import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "../dominio/erros.js";
import type {
  Fundamentacao,
  ObjetoResultado,
  OperacaoEntrada,
  ResultadoOperacao,
  SituacaoTributaria,
} from "../dominio/tipos.js";

export interface VersoesMotores {
  regimeRegular: string;
  simples: { app: string; db: string };
}

export interface MotoresPort {
  calcularOperacao(op: OperacaoEntrada): Promise<ResultadoOperacao>;
  versoes(): Promise<VersoesMotores>;
  listarSituacoes(data: string): Promise<SituacaoTributaria[]>;
  listarFundamentacoes(data: string): Promise<Fundamentacao[]>;
}

export interface ConfigMotores {
  urlRegimeRegular: string;
  urlSimples: string;
}

const MSG_INDISPONIVEL = "Motor oficial indisponível. Inicie-o com scripts\\iniciar-motores.ps1.";
const TIMEOUT_MS = 30000;

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

function detalheDoMotor(texto: string): string {
  try {
    const j = JSON.parse(texto) as { detail?: string; errors?: { detail?: string }[] };
    const extras = (j.errors ?? []).map((e) => e.detail).filter(Boolean);
    const base = j.detail ?? "Requisição recusada pelo motor oficial.";
    return extras.length ? `${base} ${extras.join("; ")}` : base;
  } catch {
    return texto.slice(0, 300) || "Requisição recusada pelo motor oficial.";
  }
}

async function requisitar(url: string, init?: RequestInit): Promise<string> {
  let res: Response;
  let texto: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // Decodifica explicitamente como UTF-8 a partir dos bytes.
    texto = new TextDecoder("utf-8").decode(await res.arrayBuffer());
  } catch {
    throw new ErroDominio(MOTOR_INDISPONIVEL, MSG_INDISPONIVEL, 503);
  }
  if (res.status >= 500) throw new ErroDominio(MOTOR_INDISPONIVEL, MSG_INDISPONIVEL, 503);
  if (res.status >= 400) throw new ErroDominio(ENTRADA_INVALIDA, detalheDoMotor(texto), 400);
  return texto;
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
  };
}
