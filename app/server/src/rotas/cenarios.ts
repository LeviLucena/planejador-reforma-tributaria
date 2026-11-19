import type { FastifyInstance } from "fastify";
import {
  listarCenarios,
  reabrirCenario,
  recalcularCenario,
  salvarCenario,
} from "../cenarios/repositorio.js";
import type { Banco } from "../db/banco.js";
import { obterEmpresa } from "../empresas/repositorio.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { idDaRota } from "./empresas.js";
import { invalida, validarConjuntoId, validarOperacao } from "./simulacao.js";

export function rotasCenarios(deps: { motores: MotoresPort; banco: Banco }) {
  const { banco } = deps;
  const idParam = (req: { params: unknown }) => idDaRota((req.params as { id?: string }).id);
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/empresas/:id/cenarios", async (req) => {
      const empresaId = idParam(req);
      obterEmpresa(banco, empresaId);
      return listarCenarios(banco, empresaId);
    });

    app.post("/api/empresas/:id/cenarios", async (req, resposta) => {
      const empresaId = idParam(req);
      const corpo = req.body as Record<string, unknown> | null;
      if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
        invalida("Corpo da requisição inválido: esperado um objeto com nome, operacao e conjuntoPremissasId.");
      }
      if (typeof corpo.nome !== "string" || corpo.nome.trim() === "") {
        invalida("Campo nome inválido: esperado texto não vazio.");
      }
      const operacao = validarOperacao(corpo.operacao);
      const conjuntoPremissasId = validarConjuntoId(corpo.conjuntoPremissasId);
      const c = await salvarCenario(deps, { empresaId, nome: corpo.nome, operacao, conjuntoPremissasId });
      return resposta.status(201).send(c);
    });

    app.get("/api/cenarios/:id", async (req) => reabrirCenario(banco, idParam(req)));

    app.post("/api/cenarios/:id/recalcular", async (req, resposta) => {
      const c = await recalcularCenario(deps, idParam(req));
      return resposta.status(201).send(c);
    });
  };
}
