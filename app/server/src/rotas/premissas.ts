import type { FastifyInstance } from "fastify";
import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio } from "../dominio/erros.js";
import { carregarDocumento } from "../premissas/carregador.js";
import {
  adicionarPremissa,
  criarConjunto,
  duplicarConjunto,
  listarConjuntos,
  listarLinhas,
  obterConjunto,
  validarConjunto,
  type PremissaEntrada,
} from "../premissas/repositorio.js";
import { idDaRota } from "./empresas.js";

function invalida(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

function objeto(corpo: unknown, descricao: string): Record<string, unknown> {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    invalida(`Corpo da requisição inválido: esperado ${descricao}.`);
  }
  return corpo as Record<string, unknown>;
}

function opcionalTexto(v: unknown, campo: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") invalida(`${campo} inválido: esperado texto.`);
  return v;
}

const idParam = (req: { params: unknown }) => idDaRota((req.params as { id?: string }).id);

/** Rotas de premissas: conjuntos, linhas, carga de documento e validação pelo usuário. */
export function rotasPremissas(deps: { banco: Banco }) {
  const { banco } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/premissas/conjuntos", async () => listarConjuntos(banco));

    app.post("/api/premissas/conjuntos", async (req, resposta) => {
      const c = objeto(req.body, "um objeto { nome, vigenciaInicio, vigenciaFim?, observacao? }");
      if (typeof c.nome !== "string" || c.nome.trim() === "" || c.nome.length > 200) {
        invalida("nome inválido: informe um texto não vazio de até 200 caracteres.");
      }
      if (typeof c.vigenciaInicio !== "string") invalida("vigenciaInicio inválida: esperado data ISO (AAAA-MM-DD).");
      const dados: { nome: string; vigenciaInicio: string; vigenciaFim?: string; observacao?: string } = {
        nome: c.nome.trim(),
        vigenciaInicio: c.vigenciaInicio,
      };
      const fim = opcionalTexto(c.vigenciaFim, "vigenciaFim");
      if (fim !== undefined) dados.vigenciaFim = fim;
      const obs = opcionalTexto(c.observacao, "observacao");
      if (obs !== undefined) dados.observacao = obs;
      const id = criarConjunto(banco, dados);
      return resposta.status(201).send(obterConjunto(banco, id));
    });

    app.get("/api/premissas/conjuntos/:id/linhas", async (req) => listarLinhas(banco, idParam(req)));

    app.post("/api/premissas/conjuntos/:id/linhas", async (req, resposta) => {
      const id = idParam(req);
      const corpo = objeto(req.body, "um objeto com a premissa (tributo, aliquota, origem, ...)");
      obterConjunto(banco, id); // 404 antes de qualquer erro de chave estrangeira
      const linhaId = adicionarPremissa(banco, id, corpo as unknown as PremissaEntrada);
      const linha = listarLinhas(banco, id).find((l) => l.id === linhaId);
      return resposta.status(201).send(linha);
    });

    app.post("/api/premissas/conjuntos/:id/duplicar", async (req, resposta) => {
      const novo = duplicarConjunto(banco, idParam(req));
      return resposta.status(201).send(obterConjunto(banco, novo));
    });

    app.post("/api/premissas/carregar", async (req, resposta) => {
      const r = carregarDocumento(banco, req.body);
      return resposta.status(201).send(r);
    });

    app.post("/api/premissas/conjuntos/:id/validar", async (req) => {
      const id = idParam(req);
      const corpo = objeto(req.body, "um objeto { validadoPor }");
      return validarConjunto(banco, id, corpo.validadoPor as string);
    });
  };
}
