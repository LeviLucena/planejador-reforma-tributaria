import type { FastifyInstance } from "fastify";
import type { Banco } from "../db/banco.js";
import { listarConjuntos } from "../premissas/repositorio.js";

/** Rotas de premissas. A Task 13 acrescenta criação, linhas, carga e validação. */
export function rotasPremissas(deps: { banco: Banco }) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/premissas/conjuntos", async () => listarConjuntos(deps.banco));
  };
}
