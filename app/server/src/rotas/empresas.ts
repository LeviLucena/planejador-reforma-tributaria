import type { FastifyInstance } from "fastify";
import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio, NAO_ENCONTRADO } from "../dominio/erros.js";
import {
  atualizarEmpresa,
  criarEmpresa,
  excluirEmpresa,
  listarEmpresas,
  obterEmpresa,
  type DadosEmpresa,
} from "../empresas/repositorio.js";

/** `:id` precisa ser inteiro positivo em texto; qualquer outra coisa é recurso inexistente (404). */
export function idDaRota(bruto: unknown): number {
  if (typeof bruto !== "string" || !/^[1-9]\d{0,14}$/.test(bruto)) {
    throw new ErroDominio(NAO_ENCONTRADO, "Recurso não encontrado.", 404);
  }
  return Number(bruto);
}

function corpoEmpresa(corpo: unknown): DadosEmpresa {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    throw new ErroDominio(ENTRADA_INVALIDA, "Corpo da requisição inválido: esperado um objeto com os dados da empresa.", 400);
  }
  return corpo as DadosEmpresa;
}

export function rotasEmpresas(deps: { banco: Banco }) {
  const { banco } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.post("/api/empresas", async (req, resposta) => {
      const e = criarEmpresa(banco, corpoEmpresa(req.body));
      return resposta.status(201).send(e);
    });
    app.get("/api/empresas", async () => listarEmpresas(banco));
    app.get("/api/empresas/:id", async (req) =>
      obterEmpresa(banco, idDaRota((req.params as { id?: string }).id)),
    );
    app.put("/api/empresas/:id", async (req) =>
      atualizarEmpresa(banco, idDaRota((req.params as { id?: string }).id), corpoEmpresa(req.body)),
    );
    app.delete("/api/empresas/:id", async (req, resposta) => {
      excluirEmpresa(banco, idDaRota((req.params as { id?: string }).id));
      return resposta.status(204).send();
    });
  };
}
