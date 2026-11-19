import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "./dominio/erros.js";
import type { Banco } from "./db/banco.js";
import type { MotoresPort } from "./motores/regimeRegular.js";
import { rotasSaude } from "./rotas/saude.js";
import { rotasCenarios } from "./rotas/cenarios.js";
import { rotasEmpresas } from "./rotas/empresas.js";
import { rotasSimulacao } from "./rotas/simulacao.js";

// As tarefas seguintes estendem.
export interface OpcoesApp {
  motores?: MotoresPort;
  banco?: Banco;
  /** Liga o log do Fastify (padrão false, para manter os testes silenciosos). */
  logger?: boolean;
  /** Pasta da interface compilada (padrão app/web/dist); só é servida se existir. */
  diretorioWeb?: string;
}

const DIRETORIO_WEB_PADRAO = fileURLToPath(new URL("../../web/dist", import.meta.url));

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

  const raizWeb = opcoes.diretorioWeb ?? DIRETORIO_WEB_PADRAO;
  const servirWeb = existsSync(raizWeb);
  if (servirWeb) {
    app.register(fastifyStatic, { root: raizWeb });
  }

  app.setNotFoundHandler((req, resposta) => {
    const caminho = req.url.split("?")[0] ?? "";
    const ehApi = caminho === "/api" || caminho.startsWith("/api/");
    if (servirWeb && req.method === "GET" && !ehApi) {
      return resposta.type("text/html").sendFile("index.html");
    }
    return resposta.status(404).send({ codigo: "NAO_ENCONTRADO", mensagem: "Rota não encontrada." });
  });

  app.register(rotasSaude);
  if (opcoes.banco) {
    app.register(rotasEmpresas({ banco: opcoes.banco }));
  }
  if (opcoes.motores && opcoes.banco) {
    const deps = { motores: opcoes.motores, banco: opcoes.banco };
    app.register(rotasSimulacao(deps));
    app.register(rotasCenarios(deps));
  }
  return app;
}
