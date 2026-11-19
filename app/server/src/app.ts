import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { ErroDominio, ENTRADA_INVALIDA, MOTOR_INDISPONIVEL } from "./dominio/erros.js";
import type { Banco } from "./db/banco.js";
import type { MotoresPort } from "./motores/regimeRegular.js";
import { rotasSaude } from "./rotas/saude.js";
import { rotasCenarios } from "./rotas/cenarios.js";
import { rotasConsultas } from "./rotas/consultas.js";
import { rotasPremissas } from "./rotas/premissas.js";
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
  /**
   * Proteção contra páginas de outros sites (CSRF e DNS rebinding), ligada pelo index.ts.
   * Sem ela (testes de rota com inject) o comportamento é o de antes.
   */
  protecaoLocal?: { porta: number; origensExtras?: string[] };
}

const METODOS_COM_CORPO = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function instalarProtecaoLocal(app: FastifyInstance, protecao: { porta: number; origensExtras?: string[] }): void {
  const hosts = new Set([`127.0.0.1:${protecao.porta}`, `localhost:${protecao.porta}`]);
  const origens = new Set([
    `http://127.0.0.1:${protecao.porta}`,
    `http://localhost:${protecao.porta}`,
    ...(protecao.origensExtras ?? []),
  ]);
  const negado = {
    codigo: "ACESSO_NEGADO",
    mensagem: "Acesso negado: este app só atende a própria página, aberta em 127.0.0.1 ou localhost.",
  };

  // Vale para tudo: API, arquivos estáticos e o fallback da SPA.
  app.addHook("onRequest", async (req, resposta) => {
    const host = (req.headers.host ?? "").toLowerCase();
    if (!hosts.has(host)) return resposta.status(403).send(negado);
    const origem = req.headers.origin;
    if (origem !== undefined && !origens.has(origem)) return resposta.status(403).send(negado);
    if (METODOS_COM_CORPO.has(req.method)) {
      const tipo = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
      if (tipo !== "application/json") {
        return resposta.status(415).send({
          codigo: "TIPO_NAO_SUPORTADO",
          mensagem: "Tipo de conteúdo não suportado: envie Content-Type: application/json.",
        });
      }
    }
  });

  // Nenhum corpo de texto é interpretado; JSON vazio (ex.: DELETE) vira undefined.
  app.removeContentTypeParser("text/plain");
  const jsonPadrao = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, corpo, feito) => {
    const texto = typeof corpo === "string" ? corpo : corpo.toString("utf8");
    if (texto === "") return feito(null, undefined);
    jsonPadrao(req, texto, feito);
  });
}

const DIRETORIO_WEB_PADRAO = fileURLToPath(new URL("../../web/dist", import.meta.url));

export function buildApp(opcoes: OpcoesApp = {}): FastifyInstance {
  const app = Fastify({ logger: opcoes.logger ?? false });
  if (opcoes.protecaoLocal) instalarProtecaoLocal(app, opcoes.protecaoLocal);

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
  if (opcoes.motores) {
    app.register(rotasConsultas({ motores: opcoes.motores }));
  }
  if (opcoes.banco) {
    app.register(rotasPremissas({ banco: opcoes.banco }));
  }
  if (opcoes.motores && opcoes.banco) {
    const deps = { motores: opcoes.motores, banco: opcoes.banco };
    app.register(rotasSimulacao(deps));
    app.register(rotasCenarios(deps));
  }
  return app;
}
