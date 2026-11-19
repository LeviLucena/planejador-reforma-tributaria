import type { FastifyInstance } from "fastify";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { validarDataIso } from "../premissas/repositorio.js";

/** Rotas finas de consulta aos dados abertos do motor (classificações e fundamentações legais). */
export function rotasConsultas(deps: { motores: MotoresPort }) {
  return async function (app: FastifyInstance): Promise<void> {
    const lerData = (req: { query: unknown }) =>
      validarDataIso((req.query as { data?: string } | undefined)?.data as string, "data");

    app.get("/api/classificacoes", async (req) => deps.motores.listarSituacoes(lerData(req)));
    app.get("/api/fundamentacoes", async (req) => deps.motores.listarFundamentacoes(lerData(req)));
  };
}
