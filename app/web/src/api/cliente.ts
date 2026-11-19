import type { Cenario, DadosCenario } from "../../../server/src/cenarios/repositorio";
import type { Empresa, DadosEmpresa } from "../../../server/src/empresas/repositorio";
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

export type CorpoCenario = Pick<DadosCenario, "nome" | "operacao" | "conjuntoPremissasId">;

async function requisicao<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const init: RequestInit = { method: metodo };
  if (corpo !== undefined) {
    init.headers = { "Content-Type": "application/json" };
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
  try {
    json = texto === "" ? undefined : JSON.parse(texto);
  } catch {
    json = undefined;
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
    recalcular: (id: number) => requisicao<Cenario>("POST", `/api/cenarios/${id}/recalcular`),
  },
};
