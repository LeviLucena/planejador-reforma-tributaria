import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { abrirBanco, type Banco } from "../db/banco.js";

const ARQUIVO = fileURLToPath(new URL("../../../../dados/premissas/2027-oficial.json", import.meta.url));

let banco: Banco;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  banco = abrirBanco(":memory:");
  app = buildApp({ banco });
});

const postar = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });

async function novoConjunto(extra: object = {}) {
  const r = await postar("/api/premissas/conjuntos", { nome: "Rascunho meu", vigenciaInicio: "2027-01-01", ...extra });
  return r.json() as { id: number };
}

describe("POST /api/premissas/conjuntos", () => {
  it("cria e devolve 201 no formato da listagem", async () => {
    const r = await postar("/api/premissas/conjuntos", { nome: "A", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-12-31", observacao: "x" });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: 1, nome: "A", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-12-31", observacao: "x", validadoPor: null, validadoEm: null, linhas: 0 });
    const lista = await app.inject({ method: "GET", url: "/api/premissas/conjuntos" });
    expect(lista.json()).toHaveLength(1);
  });
  it("400 para nome vazio, data inválida, fim antes do início e corpo que não é objeto", async () => {
    for (const corpo of [{ nome: "  ", vigenciaInicio: "2027-01-01" }, { nome: "A", vigenciaInicio: "2027-13-01" }, { nome: "A", vigenciaInicio: "2027-02-01", vigenciaFim: "2027-01-01" }, { vigenciaInicio: "2027-01-01" }, [1]]) {
      const r = await postar("/api/premissas/conjuntos", corpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().codigo).toBe("ENTRADA_INVALIDA");
    }
  });
});

describe("linhas de um conjunto", () => {
  it("adiciona (201) e lista com a alíquota como texto", async () => {
    const { id } = await novoConjunto();
    const r = await postar(`/api/premissas/conjuntos/${id}/linhas`, { tributo: "CBS", aliquota: "8.80", origem: "usuario" });
    expect(r.statusCode).toBe(201);
    const l = await app.inject({ method: "GET", url: `/api/premissas/conjuntos/${id}/linhas` });
    expect(l.json()).toEqual([
      { id: 1, tributo: "CBS", uf: null, municipioIbge: null, aliquota: "8.80", origem: "usuario", fonteNorma: null, fonteArtigo: null, consultadoEm: null },
    ]);
  });
  it("linha oficial/lei_transicao sem fonte: 400 nomeando os campos faltantes", async () => {
    const { id } = await novoConjunto();
    const r = await postar(`/api/premissas/conjuntos/${id}/linhas`, { tributo: "CBS", aliquota: "8.8", origem: "oficial", fonteNorma: "LC 214" });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toMatch(/fonteArtigo, consultadoEm/);
    expect((await app.inject({ method: "GET", url: `/api/premissas/conjuntos/${id}/linhas` })).json()).toEqual([]);
  });
  it("conjunto inexistente: 404 NAO_ENCONTRADO (não erro de chave estrangeira)", async () => {
    const r = await postar("/api/premissas/conjuntos/999/linhas", { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    expect(r.statusCode).toBe(404);
    expect(r.json().codigo).toBe("NAO_ENCONTRADO");
    expect((await app.inject({ method: "GET", url: "/api/premissas/conjuntos/999/linhas" })).statusCode).toBe(404);
  });
  it("id não inteiro ou inválido: 404; corpo que não é objeto: 400; duplicata: 400", async () => {
    for (const id of ["abc", "0", "1.5", "-1"]) {
      expect((await app.inject({ method: "GET", url: `/api/premissas/conjuntos/${id}/linhas` })).statusCode).toBe(404);
      expect((await postar(`/api/premissas/conjuntos/${id}/validar`, { validadoPor: "Ana" })).statusCode).toBe(404);
    }
    const { id } = await novoConjunto();
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, [1])).statusCode).toBe(400);
    const l = { tributo: "CBS", aliquota: "8.8", origem: "usuario" };
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, l)).statusCode).toBe(201);
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, l)).statusCode).toBe(400);
  });
  it("rejeita alíquota acima de 100 e UF inexistente pela rota", async () => {
    const { id } = await novoConjunto();
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, { tributo: "CBS", aliquota: "100.01", origem: "usuario" })).statusCode).toBe(400);
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, { tributo: "IBS_UF", uf: "XX", aliquota: "1", origem: "usuario" })).statusCode).toBe(400);
  });
});

describe("POST /api/premissas/carregar", () => {
  it("carrega o documento real 2027-oficial.json: 2 linhas lei_transicao, vigência até 2028-12-31, não validado", async () => {
    const documento = JSON.parse(readFileSync(ARQUIVO, "utf8")) as object;
    const r = await postar("/api/premissas/carregar", documento);
    expect(r.statusCode).toBe(201);
    const { conjuntoId, linhas } = r.json() as { conjuntoId: number; linhas: number };
    expect(linhas).toBe(2);
    const l = (await app.inject({ method: "GET", url: `/api/premissas/conjuntos/${conjuntoId}/linhas` })).json() as { origem: string }[];
    expect(l).toHaveLength(2);
    expect(l.every((x) => x.origem === "lei_transicao")).toBe(true);
    const c = (await app.inject({ method: "GET", url: "/api/premissas/conjuntos" })).json() as {
      id: number;
      vigenciaFim: string;
      validadoPor: string | null;
      validadoEm: string | null;
    }[];
    const meu = c.find((x) => x.id === conjuntoId)!;
    expect(meu.vigenciaFim).toBe("2028-12-31");
    expect(meu.validadoPor).toBeNull();
    expect(meu.validadoEm).toBeNull();
  });
  it("documento inválido: 400 e nada gravado", async () => {
    const r = await postar("/api/premissas/carregar", {
      conjunto: { nome: "Meu", vigenciaInicio: "2027-01-01" },
      linhas: [
        { tributo: "CBS", aliquota: "8.8", origem: "usuario" },
        { tributo: "IBS_UF", aliquota: "1", origem: "oficial" },
      ],
    });
    expect(r.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/premissas/conjuntos" })).json()).toEqual([]);
    expect((await postar("/api/premissas/carregar", { conjunto: { nome: "x", vigenciaInicio: "2027-01-01" }, linhas: [], extra: 1 })).statusCode).toBe(400);
    expect((await postar("/api/premissas/carregar", [])).statusCode).toBe(400);
  });
});

describe("POST /api/premissas/conjuntos/:id/validar", () => {
  it("exige validadoPor não vazio (até 200 caracteres)", async () => {
    const { id } = await novoConjunto();
    for (const corpo of [{}, { validadoPor: "" }, { validadoPor: "   " }, { validadoPor: 5 }, { validadoPor: "a".repeat(201) }, []]) {
      expect((await postar(`/api/premissas/conjuntos/${id}/validar`, corpo)).statusCode).toBe(400);
    }
    const lista = (await app.inject({ method: "GET", url: "/api/premissas/conjuntos" })).json() as { validadoPor: string | null }[];
    expect(lista[0]!.validadoPor).toBeNull();
  });
  it("preenche validadoPor e validadoEm e devolve o conjunto; validar de novo sobrescreve", async () => {
    const { id } = await novoConjunto();
    const r1 = await postar(`/api/premissas/conjuntos/${id}/validar`, { validadoPor: "  Ana Souza " });
    expect(r1.statusCode).toBe(200);
    const c1 = r1.json() as { validadoPor: string; validadoEm: string; id: number };
    expect(c1.id).toBe(id);
    expect(c1.validadoPor).toBe("Ana Souza");
    expect(c1.validadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const r2 = await postar(`/api/premissas/conjuntos/${id}/validar`, { validadoPor: "Bruno" });
    expect((r2.json() as { validadoPor: string }).validadoPor).toBe("Bruno");
  });
  it("conjunto inexistente: 404", async () => {
    expect((await postar("/api/premissas/conjuntos/77/validar", { validadoPor: "Ana" })).statusCode).toBe(404);
  });
});

describe("conjunto validado e duplicação pelas rotas", () => {
  const linha = { tributo: "CBS", aliquota: "8.8", origem: "usuario" };

  it("depois de validar, adicionar linha responde 409 CONJUNTO_VALIDADO", async () => {
    const { id } = await novoConjunto();
    expect((await postar(`/api/premissas/conjuntos/${id}/linhas`, linha)).statusCode).toBe(201);
    await postar(`/api/premissas/conjuntos/${id}/validar`, { validadoPor: "Ana" });
    const r = await postar(`/api/premissas/conjuntos/${id}/linhas`, { tributo: "IS_ADREM", aliquota: "1", origem: "usuario" });
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe("CONJUNTO_VALIDADO");
    expect((await app.inject({ method: "GET", url: `/api/premissas/conjuntos/${id}/linhas` })).json()).toHaveLength(1);
  });

  it("POST /duplicar: 201 com a cópia não validada e editável; original intacto", async () => {
    const { id } = await novoConjunto({ nome: "Meu" });
    await postar(`/api/premissas/conjuntos/${id}/linhas`, linha);
    await postar(`/api/premissas/conjuntos/${id}/validar`, { validadoPor: "Ana" });
    const r = await postar(`/api/premissas/conjuntos/${id}/duplicar`, {});
    expect(r.statusCode).toBe(201);
    const copia = r.json() as { id: number; nome: string; validadoPor: string | null; linhas: number };
    expect(copia).toMatchObject({ nome: "Meu (cópia)", validadoPor: null, linhas: 1 });
    expect((await postar(`/api/premissas/conjuntos/${copia.id}/linhas`, { tributo: "IS_ADREM", aliquota: "1", origem: "usuario" })).statusCode).toBe(201);
    const lista = (await app.inject({ method: "GET", url: "/api/premissas/conjuntos" })).json() as { id: number; validadoPor: string | null; linhas: number }[];
    expect(lista.find((c) => c.id === id)).toMatchObject({ validadoPor: "Ana", linhas: 1 });
  });

  it("duplicar id inexistente ou inválido: 404", async () => {
    expect((await postar("/api/premissas/conjuntos/99/duplicar", {})).statusCode).toBe(404);
    expect((await postar("/api/premissas/conjuntos/abc/duplicar", {})).statusCode).toBe(404);
  });

  it("/carregar continua criando conjuntos novos normalmente", async () => {
    const doc = { conjunto: { nome: "Doc", vigenciaInicio: "2027-01-01" }, linhas: [{ tributo: "CBS", aliquota: "1", origem: "usuario" }] };
    expect((await postar("/api/premissas/carregar", doc)).statusCode).toBe(201);
    expect((await postar("/api/premissas/carregar", doc)).statusCode).toBe(201);
  });
});
