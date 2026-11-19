import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { ErroDominio } from "../dominio/erros.js";

describe("GET /api/saude", () => {
  it("retorna 200 e status ok", async () => {
    const app = buildApp();
    const r = await app.inject({ method: "GET", url: "/api/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok" });
  });
});

describe("tratamento de erros", () => {
  it("converte ErroDominio no status e corpo corretos", async () => {
    const app = buildApp();
    app.get("/teste/dominio", async () => {
      throw new ErroDominio("PREMISSA_AUSENTE", "Falta a premissa X.", 422);
    });
    const r = await app.inject({ method: "GET", url: "/teste/dominio" });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toEqual({ codigo: "PREMISSA_AUSENTE", mensagem: "Falta a premissa X." });
  });

  it("erro desconhecido vira 500 generico sem vazar a mensagem", async () => {
    const app = buildApp();
    app.get("/teste/boom", async () => {
      throw new Error("segredo interno do banco");
    });
    const r = await app.inject({ method: "GET", url: "/teste/boom" });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
    expect(r.body).not.toContain("segredo");
  });

  it("JSON malformado vira ENTRADA_INVALIDA 400", async () => {
    const app = buildApp();
    app.post("/teste/eco", async (req) => req.body);
    const r = await app.inject({
      method: "POST",
      url: "/teste/eco",
      headers: { "content-type": "application/json" },
      payload: "{malformado",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe("ENTRADA_INVALIDA");
    expect(typeof r.json().mensagem).toBe("string");
  });
});
