import type { FastifyInstance } from "fastify";

export async function rotasSaude(app: FastifyInstance): Promise<void> {
  app.get("/api/saude", async () => ({ status: "ok" }));
}
