import type { Cenario, DadosCenario } from "../../../server/src/cenarios/repositorio";
import type { Empresa, DadosEmpresa } from "../../../server/src/empresas/repositorio";
import type { Fundamentacao, SituacaoTributaria } from "../../../server/src/dominio/tipos";
import type { ConjuntoResumo, LinhaPremissa, PremissaEntrada } from "../../../server/src/premissas/repositorio";
import type { RequisicaoSimulacao, RespostaSimulacao } from "../../../server/src/simulacao/servico";

export class ErroApi extends Error {
  codigo: string;
  status: number;
  constructor(codigo: string, mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroApi";
    this.codigo = codigo;
    this.status = status;
  }
}

export type CorpoConjunto = { nome: string; vigenciaInicio: string; vigenciaFim?: string; observacao?: string };

export type CorpoCenario = Pick<DadosCenario, "nome" | "operacao" | "conjuntoPremissasId">;

async function requisicao<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const init: RequestInit = { method: metodo };
  // O servidor recusa (415) POST/PUT/PATCH/DELETE sem Content-Type: application/json
  // (proteção contra formulários e fetch "no-cors" de outros sites).
  if (metodo !== "GET" && metodo !== "HEAD") {
    init.headers = { "Content-Type": "application/json" };
  }
  if (corpo !== undefined) {
    init.body = JSON.stringify(corpo);
  }
  let resposta: Response;
  try {
    resposta = await fetch(caminho, init);
  } catch {
    throw new ErroApi("SEM_CONEXAO", "Não foi possível conectar ao servidor. Verifique se ele está em execução.", 0);
  }
  const texto = await resposta.text();
  let json: unknown;
  let jsonInvalido = false;
  try {
    json = texto === "" ? undefined : JSON.parse(texto);
  } catch {
    json = undefined;
    jsonInvalido = true;
  }
  if (resposta.ok && jsonInvalido) {
    throw new ErroApi("RESPOSTA_INVALIDA", "O servidor respondeu com um conteúdo que não pôde ser lido (JSON inválido).", resposta.status);
  }
  if (!resposta.ok) {
    const e = (json ?? {}) as { codigo?: string; mensagem?: string };
    throw new ErroApi(e.codigo ?? "ERRO_INTERNO", e.mensagem ?? "Erro inesperado.", resposta.status);
  }
  return (resposta.status === 204 ? undefined : json) as T;
}

export const cliente = {
  saude: () => requisicao<{ status: string }>("GET", "/api/saude"),
  simular: (req: RequisicaoSimulacao) => requisicao<RespostaSimulacao>("POST", "/api/simular", req),
  classificacoes: (data: string) =>
    requisicao<SituacaoTributaria[]>("GET", `/api/classificacoes?data=${encodeURIComponent(data)}`),
  fundamentacoes: (data: string) =>
    requisicao<Fundamentacao[]>("GET", `/api/fundamentacoes?data=${encodeURIComponent(data)}`),
  premissas: {
    conjuntos: () => requisicao<ConjuntoResumo[]>("GET", "/api/premissas/conjuntos"),
    criarConjunto: (dados: CorpoConjunto) => requisicao<ConjuntoResumo>("POST", "/api/premissas/conjuntos", dados),
    linhas: (conjuntoId: number) =>
      requisicao<LinhaPremissa[]>("GET", `/api/premissas/conjuntos/${conjuntoId}/linhas`),
    adicionarLinha: (conjuntoId: number, linha: PremissaEntrada) =>
      requisicao<LinhaPremissa>("POST", `/api/premissas/conjuntos/${conjuntoId}/linhas`, linha),
    duplicar: (conjuntoId: number) =>
      requisicao<ConjuntoResumo>("POST", `/api/premissas/conjuntos/${conjuntoId}/duplicar`, {}),
    carregar: (documento: unknown) =>
      requisicao<{ conjuntoId: number; linhas: number }>("POST", "/api/premissas/carregar", documento),
    validar: (conjuntoId: number, validadoPor: string) =>
      requisicao<ConjuntoResumo>("POST", `/api/premissas/conjuntos/${conjuntoId}/validar`, { validadoPor }),
  },
  empresas: {
    listar: () => requisicao<Empresa[]>("GET", "/api/empresas"),
    obter: (id: number) => requisicao<Empresa>("GET", `/api/empresas/${id}`),
    criar: (dados: DadosEmpresa) => requisicao<Empresa>("POST", "/api/empresas", dados),
    atualizar: (id: number, dados: DadosEmpresa) => requisicao<Empresa>("PUT", `/api/empresas/${id}`, dados),
    remover: (id: number) => requisicao<void>("DELETE", `/api/empresas/${id}`),
  },
  cenarios: {
    listar: (empresaId: number) => requisicao<Cenario[]>("GET", `/api/empresas/${empresaId}/cenarios`),
    salvar: (empresaId: number, dados: CorpoCenario) =>
      requisicao<Cenario>("POST", `/api/empresas/${empresaId}/cenarios`, dados),
    obter: (id: number) => requisicao<Cenario>("GET", `/api/cenarios/${id}`),
    recalcular: (id: number) => requisicao<Cenario>("POST", `/api/cenarios/${id}/recalcular`, {}),
  },
};
