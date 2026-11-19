import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

function criarDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "dist-web-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>INDEX</title>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "a.js"), "console.log(1)");
  return dir;
}

describe("serviço da interface compilada", () => {
  it("/ serve o index", async () => {
    const app = buildApp({ diretorioWeb: criarDist() });
    const r = await app.inject({ method: "GET", url: "/" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("INDEX");
  });
  it("rota qualquer cai no index (SPA)", async () => {
    const app = buildApp({ diretorioWeb: criarDist() });
    const r = await app.inject({ method: "GET", url: "/qualquer-rota" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("INDEX");
  });
  it("arquivo estático é servido", async () => {
    const app = buildApp({ diretorioWeb: criarDist() });
    const r = await app.inject({ method: "GET", url: "/assets/a.js" });
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe("console.log(1)");
  });
  it("/api/inexistente continua 404 em JSON", async () => {
    const app = buildApp({ diretorioWeb: criarDist() });
    const r = await app.inject({ method: "GET", url: "/api/inexistente" });
    expect(r.statusCode).toBe(404);
    expect(r.json().codigo).toBe("NAO_ENCONTRADO");
  });
  it("sem pasta dist, / é 404 JSON", async () => {
    const app = buildApp({ diretorioWeb: join(tmpdir(), "nao-existe-dist-xyz") });
    const r = await app.inject({ method: "GET", url: "/" });
    expect(r.statusCode).toBe(404);
    expect(r.json().codigo).toBe("NAO_ENCONTRADO");
  });
});
