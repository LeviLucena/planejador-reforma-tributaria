import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { abrirBanco, type Banco } from "../db/banco.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { criarConjunto } from "../premissas/repositorio.js";

const listarSituacoes = vi.fn();
const listarFundamentacoes = vi.fn();
const motores = { listarSituacoes, listarFundamentacoes } as unknown as MotoresPort;

beforeEach(() => {
  listarSituacoes.mockReset().mockResolvedValue([{ id: 1, codigo: "000", descricao: "d", classificacoesTributarias: [] }]);
  listarFundamentacoes.mockReset().mockResolvedValue([{ codigoClassificacaoTributaria: "000001" }]);
});

describe("GET /api/classificacoes e /api/fundamentacoes", () => {
  it("repassa a lista do motor para a data informada", async () => {
    const app = buildApp({ motores });
    const a = await app.inject({ method: "GET", url: "/api/classificacoes?data=2027-01-01" });
    expect(a.statusCode).toBe(200);
    expect(a.json()[0].codigo).toBe("000");
    expect(listarSituacoes).toHaveBeenCalledWith("2027-01-01");
    const b = await app.inject({ method: "GET", url: "/api/fundamentacoes?data=2027-01-01" });
    expect(b.statusCode).toBe(200);
    expect(b.json()[0].codigoClassificacaoTributaria).toBe("000001");
    expect(listarFundamentacoes).toHaveBeenCalledWith("2027-01-01");
  });

  it.each(["", "?data=", "?data=2027-02-30", "?data=abc"])("data inválida (%s) dá 400 ENTRADA_INVALIDA", async (q) => {
    const app = buildApp({ motores });
    for (const rota of ["classificacoes", "fundamentacoes"]) {
      const r = await app.inject({ method: "GET", url: `/api/${rota}${q}` });
      expect(r.statusCode).toBe(400);
      expect(r.json().codigo).toBe("ENTRADA_INVALIDA");
    }
  });

  it("sem motores a rota não existe", async () => {
    const app = buildApp({});
    expect((await app.inject({ method: "GET", url: "/api/classificacoes?data=2027-01-01" })).statusCode).toBe(404);
  });
});

describe("GET /api/premissas/conjuntos", () => {
  let banco: Banco;
  beforeEach(() => {
    banco = abrirBanco(":memory:");
  });

  it("lista os conjuntos com a contagem de linhas", async () => {
    const id = criarConjunto(banco, { nome: "base", vigenciaInicio: "2027-01-01", observacao: "obs" });
    banco.prepare("INSERT INTO premissa_aliquota (conjunto_id, tributo, aliquota, origem) VALUES (?, 'CBS', '8.8', 'usuario')").run(id);
    const app = buildApp({ banco });
    const r = await app.inject({ method: "GET", url: "/api/premissas/conjuntos" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([
      { id, nome: "base", vigenciaInicio: "2027-01-01", vigenciaFim: null, observacao: "obs", validadoPor: null, validadoEm: null, linhas: 1 },
    ]);
  });

  it("sem banco a rota não existe", async () => {
    expect((await buildApp({}).inject({ method: "GET", url: "/api/premissas/conjuntos" })).statusCode).toBe(404);
  });
});
