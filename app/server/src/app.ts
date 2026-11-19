import Fastify, { type FastifyInstance } from "fastify";
import { ErroDominio, ENTRADA_INVALIDA } from "./dominio/erros.js";
import type { Banco } from "./db/banco.js";
import type { MotoresPort } from "./motores/regimeRegular.js";
import { rotasSaude } from "./rotas/saude.js";

// As tarefas seguintes estendem.
export interface OpcoesApp {
  motores?: MotoresPort;
  banco?: Banco;
}

export function buildApp(_opcoes: OpcoesApp = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((erro: Error, _req, resposta) => {
    if (erro instanceof ErroDominio) {
      return resposta.status(erro.status).send({ codigo: erro.codigo, mensagem: erro.message });
    }
    const status = (erro as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return resposta.status(status).send({ codigo: ENTRADA_INVALIDA, mensagem: erro.message });
    }
    app.log.error(erro);
    return resposta.status(500).send({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
  });

  app.register(rotasSaude);
  return app;
}
