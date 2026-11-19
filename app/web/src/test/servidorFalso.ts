// Servidor falso em memória para os testes de empresas e cenários.
// REAIS: `resposta-oficial.json` (resposta do motor da Receita) e `operacao-oficial.json` (exemplo oficial).
// SINTÉTICOS (apenas substitutos de teste): ids, nomes, datas de criação e o texto de `versaoMotor`.
import type { Cenario } from "../../../server/src/cenarios/repositorio";
import type { Empresa } from "../../../server/src/empresas/repositorio";
import operacaoOficial from "../exemplos/operacao-oficial.json";
import classificacoes from "./classificacoes-amostra.json";
import fundamentacoes from "./fundamentacoes-amostra.json";
import respostaOficial from "./resposta-oficial.json";

export const VERSAO_MOTOR = "regular=1.6.1+V0059; simples=0.0.6/V0059"; // sintético, no formato do servidor
export const CONJUNTOS = [
  { id: 1, nome: "Premissas 2027 (rascunho)", vigenciaInicio: "2027-01-01", vigenciaFim: null, observacao: null, validadoPor: null, validadoEm: null, linhas: 4 },
  { id: 2, nome: "Premissas validadas", vigenciaInicio: "2027-01-01", vigenciaFim: null, observacao: null, validadoPor: "Ana", validadoEm: "2026-11-18T15:00:00.000Z", linhas: 4 },
];

export interface Chamada {
  metodo: string;
  url: string;
  corpo: unknown;
}
export type Resp = { ok: boolean; status: number; text: () => Promise<string> };
export const resp = (status: number, corpo?: unknown): Resp => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (corpo === undefined ? "" : JSON.stringify(corpo)),
});
type Sobrescrita = (corpo: unknown) => Resp | Promise<Resp>;

export function criarServidorFalso(inicial: { empresas?: Empresa[]; cenarios?: Cenario[]; conjuntos?: unknown[] } = {}) {
  const estado = {
    empresas: [...(inicial.empresas ?? [])],
    cenarios: [...(inicial.cenarios ?? [])],
    conjuntos: inicial.conjuntos ?? CONJUNTOS,
    proximoId: 100,
    relogio: 0,
  };
  const chamadas: Chamada[] = [];
  const sobrescritas = new Map<string, Sobrescrita>();

  const nova = (empresaId: number, nome: string, versao: number, operacao: unknown, conjunto: number): Cenario => {
    const dia = 18 + estado.relogio++;
    return {
      id: estado.proximoId++,
      empresaId,
      nome,
      versaoNumero: versao,
      entrada: operacao as never,
      entradaEnviada: operacaoOficial as never,
      origensPremissas: { CBS: "oficial", IBS_UF: "usuario" },
      resultado: respostaOficial as never,
      versaoMotor: VERSAO_MOTOR,
      conjuntoPremissasId: conjunto,
      criadoEm: `2026-11-${dia}T15:30:00.000Z`,
    };
  };

  async function tratar(url: string, init?: RequestInit): Promise<Resp> {
    const metodo = init?.method ?? "GET";
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    chamadas.push({ metodo, url, corpo });
    const forcada = sobrescritas.get(`${metodo} ${url}`);
    if (forcada) return forcada(corpo);
    let m: RegExpExecArray | null;
    if (url.startsWith("/api/premissas/conjuntos")) return resp(200, estado.conjuntos);
    if (url.startsWith("/api/classificacoes")) return resp(200, classificacoes);
    if (url.startsWith("/api/fundamentacoes")) return resp(200, fundamentacoes);
    if (url === "/api/simular" && metodo === "POST") {
      return resp(200, { resultado: respostaOficial, entradaEnviada: operacaoOficial, origensPremissas: { CBS: "oficial" } });
    }
    if (url === "/api/empresas" && metodo === "GET") return resp(200, estado.empresas);
    if (url === "/api/empresas" && metodo === "POST") {
      const e: Empresa = { id: estado.proximoId++, ...corpo, criadoEm: "2026-11-18T12:00:00.000Z", atualizadoEm: "2026-11-18T12:00:00.000Z" };
      estado.empresas.push(e);
      return resp(201, e);
    }
    if ((m = /^\/api\/empresas\/(\d+)$/.exec(url))) {
      const id = Number(m[1]);
      const i = estado.empresas.findIndex((e) => e.id === id);
      if (i < 0) return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: `Empresa ${id} não encontrada.` });
      if (metodo === "GET") return resp(200, estado.empresas[i]);
      if (metodo === "PUT") {
        estado.empresas[i] = { ...estado.empresas[i]!, ...corpo };
        return resp(200, estado.empresas[i]);
      }
      if (metodo === "DELETE") {
        estado.empresas.splice(i, 1);
        estado.cenarios = estado.cenarios.filter((c) => c.empresaId !== id);
        return resp(204);
      }
    }
    if ((m = /^\/api\/empresas\/(\d+)\/cenarios$/.exec(url))) {
      const empresaId = Number(m[1]);
      if (metodo === "GET") return resp(200, estado.cenarios.filter((c) => c.empresaId === empresaId));
      if (estado.cenarios.some((c) => c.empresaId === empresaId && c.nome === corpo.nome)) {
        return resp(400, { codigo: "ENTRADA_INVALIDA", mensagem: `Já existe um cenário chamado "${corpo.nome}". Use Recalcular ou escolha outro nome.` });
      }
      const c = nova(empresaId, corpo.nome, 1, corpo.operacao, corpo.conjuntoPremissasId);
      estado.cenarios.push(c);
      return resp(201, c);
    }
    if ((m = /^\/api\/cenarios\/(\d+)$/.exec(url))) {
      const c = estado.cenarios.find((x) => x.id === Number(m![1]));
      return c ? resp(200, c) : resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "Cenário não encontrado." });
    }
    if ((m = /^\/api\/cenarios\/(\d+)\/recalcular$/.exec(url))) {
      const base = estado.cenarios.find((x) => x.id === Number(m![1]));
      if (!base) return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "Cenário não encontrado." });
      const maior = Math.max(...estado.cenarios.filter((c) => c.empresaId === base.empresaId && c.nome === base.nome).map((c) => c.versaoNumero));
      const c = nova(base.empresaId, base.nome, maior + 1, base.entrada, base.conjuntoPremissasId);
      estado.cenarios.push(c);
      return resp(201, c);
    }
    return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "rota desconhecida" });
  }

  const fetchFalso = vi.fn(tratar);
  return { estado, chamadas, sobrescritas, fetchFalso, instalar: () => vi.stubGlobal("fetch", fetchFalso), nova };
}

export const empresaSintetica = (extra: Partial<Empresa> = {}): Empresa => ({
  id: 7,
  razaoSocial: "Comercial Exemplo Ltda",
  cnpj: "11222333000181",
  regimeAtual: "presumido",
  uf: "RS",
  municipioIbge: "4314902",
  criadoEm: "2026-11-18T12:00:00.000Z",
  atualizadoEm: "2026-11-18T12:00:00.000Z",
  ...extra,
});
