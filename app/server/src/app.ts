import Fastify, { type FastifyInstance } from "fastify";
import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "./dominio/erros.js";
import type { Banco } from "./db/banco.js";
import type { MotoresPort } from "./motores/regimeRegular.js";
import { rotasSaude } from "./rotas/saude.js";
import { rotasSimulacao } from "./rotas/simulacao.js";

// As tarefas seguintes estendem.
export interface OpcoesApp {
  motores?: MotoresPort;
  banco?: Banco;
  /** Liga o log do Fastify (padrão false, para manter os testes silenciosos). */
  logger?: boolean;
}

export function buildApp(opcoes: OpcoesApp = {}): FastifyInstance {
  const app = Fastify({ logger: opcoes.logger ?? false });

  app.setErrorHandler((erro: Error, _req, resposta) => {
    if (erro instanceof ErroDominio) {
      if (erro.status >= 500 && erro.codigo !== MOTOR_INDISPONIVEL) {
        app.log.error(erro);
        return resposta.status(erro.status).send({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
      }
      return resposta.status(erro.status).send({ codigo: erro.codigo, mensagem: erro.message });
    }
    const status = (erro as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return resposta.status(status).send({ codigo: ENTRADA_INVALIDA, mensagem: erro.message });
    }
    app.log.error(erro);
    return resposta.status(500).send({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
  });

  app.setNotFoundHandler((_req, resposta) =>
    resposta.status(404).send({ codigo: "NAO_ENCONTRADO", mensagem: "Rota não encontrada." }),
  );

  app.register(rotasSaude);
  if (opcoes.motores && opcoes.banco) {
    app.register(rotasSimulacao({ motores: opcoes.motores, banco: opcoes.banco }));
  }
  return app;
}
