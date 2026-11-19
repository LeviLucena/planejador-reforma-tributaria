import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { criarMotores } from "../motores/regimeRegular.js";

const app = buildApp({ motores: criarMotores(config) });

describe("consultas com o motor real", () => {
  it("classificacoes de 2027-01-01 traz a situação 000 com 000001", async () => {
    const r = await app.inject({ method: "GET", url: "/api/classificacoes?data=2027-01-01" });
    expect(r.statusCode).toBe(200);
    const s = (r.json() as { codigo: string; classificacoesTributarias: { codigo: string }[] }[]).find((x) => x.codigo === "000");
    expect(s?.classificacoesTributarias.map((c) => c.codigo)).toContain("000001");
  });

  it("fundamentacoes de 2027-01-01 traz 000001 com LC 214/2025", async () => {
    const r = await app.inject({ method: "GET", url: "/api/fundamentacoes?data=2027-01-01" });
    expect(r.statusCode).toBe(200);
    const f = (r.json() as { codigoClassificacaoTributaria: string; textoCurto: string }[]).filter(
      (x) => x.codigoClassificacaoTributaria === "000001",
    );
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.textoCurto === "LC 214/2025")).toBe(true);
  });
});
