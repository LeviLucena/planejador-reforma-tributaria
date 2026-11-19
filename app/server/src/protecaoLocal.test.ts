import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { abrirBanco, type Banco } from "./db/banco.js";
import type { OperacaoEntrada, ResultadoOperacao } from "./dominio/tipos.js";
import type { MotoresPort } from "./motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "./premissas/repositorio.js";

// I4: proteção contra páginas de outros sites (CSRF / DNS rebinding).
const ler = (n: string) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), "utf8");
const oficial = JSON.parse(ler("operacao-oficial.json")) as OperacaoEntrada;
const respostaOficial = JSON.parse(ler("resposta-oficial.json")) as ResultadoOperacao;

const PORTA = 3000;
const HOST = `127.0.0.1:${PORTA}`;
let banco: Banco;
let chamadas: number;
// fake só para isolar a rede (não fabrica números: devolve a resposta oficial real gravada)
const motores = {
  async calcularOperacao() {
    chamadas++;
    return structuredClone(respostaOficial);
  },
  async versoes() {
    return { regimeRegular: "1.6.1+V0059", simples: { app: "0.0.6", db: "V0059" } };
  },
} as unknown as MotoresPort;

let app: ReturnType<typeof buildApp>;
let conjuntoId: number;
beforeEach(() => {
  banco = abrirBanco(":memory:");
  chamadas = 0;
  conjuntoId = criarConjunto(banco, { nome: "t", vigenciaInicio: "2027-01-01" });
  adicionarPremissa(banco, conjuntoId, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
  app = buildApp({ motores, banco, protecaoLocal: { porta: PORTA } });
});

const contarEmpresas = () => (banco.prepare("SELECT COUNT(*) AS n FROM empresa").get() as { n: number }).n;
const contarConjuntos = () => (banco.prepare("SELECT COUNT(*) AS n FROM conjunto_premissas").get() as { n: number }).n;
const json = { "content-type": "application/json" };
const empresa = {
  razaoSocial: "Padaria Exemplo Ltda",
  cnpj: "11.222.333/0001-81",
  regimeAtual: "presumido",
  uf: "RS",
  municipioIbge: "4314902",
};

async function criarEmpresa(cnpj = empresa.cnpj): Promise<number> {
  const r = await app.inject({
    method: "POST",
    url: "/api/empresas",
    headers: { host: HOST, ...json },
    payload: JSON.stringify({ ...empresa, cnpj }),
  });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}

describe("proteção local: Host", () => {
  it("Host certo (127.0.0.1 ou localhost) e sem Origin funciona", async () => {
    for (const host of [HOST, `localhost:${PORTA}`]) {
      const r = await app.inject({ method: "GET", url: "/api/saude", headers: { host } });
      expect(r.statusCode).toBe(200);
    }
  });

  it("Host estranho -> 403 ACESSO_NEGADO, também no GET /api/saude", async () => {
    for (const host of ["evil.example", `evil.example:${PORTA}`, "127.0.0.1:9999", "127.0.0.1"]) {
      const r = await app.inject({ method: "GET", url: "/api/saude", headers: { host } });
      expect(r.statusCode).toBe(403);
      expect(r.json().codigo).toBe("ACESSO_NEGADO");
      expect(typeof r.json().mensagem).toBe("string");
    }
  });

  it("GET /api/empresas com Host estranho (DNS rebinding) não vaza dados", async () => {
    await criarEmpresa();
    const r = await app.inject({ method: "GET", url: "/api/empresas", headers: { host: `rebind.example:${PORTA}` } });
    expect(r.statusCode).toBe(403);
    expect(r.body).not.toContain("Padaria");
  });

  it("o fallback da SPA e a raiz também checam o Host", async () => {
    const dir = mkdtempSync(join(tmpdir(), "dist-protecao-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>INDEX</title>");
    const comWeb = buildApp({ diretorioWeb: dir, protecaoLocal: { porta: PORTA } });
    const ruim = await comWeb.inject({ method: "GET", url: "/qualquer", headers: { host: "evil.example" } });
    expect(ruim.statusCode).toBe(403);
    expect(ruim.body).not.toContain("INDEX");
    const raiz = await comWeb.inject({ method: "GET", url: "/", headers: { host: "evil.example" } });
    expect(raiz.statusCode).toBe(403);
    const bom = await comWeb.inject({ method: "GET", url: "/qualquer", headers: { host: HOST } });
    expect(bom.statusCode).toBe(200);
    expect(bom.body).toContain("INDEX");
  });
});

describe("proteção local: Origin", () => {
  it("Origin de outro site -> 403 e nada é gravado", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { host: HOST, origin: "https://evil.example", ...json },
      payload: JSON.stringify(empresa),
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().codigo).toBe("ACESSO_NEGADO");
    expect(contarEmpresas()).toBe(0);
  });

  it("Origin 'null', de outra porta ou parecida -> 403", async () => {
    for (const origin of ["null", "http://127.0.0.1:5173", `http://127.0.0.1:${PORTA}.evil.example`, `https://127.0.0.1:${PORTA}`]) {
      const r = await app.inject({ method: "GET", url: "/api/saude", headers: { host: HOST, origin } });
      expect(r.statusCode).toBe(403);
    }
  });

  it("Origin da própria app funciona", async () => {
    const cnpjs = ["11.222.333/0001-81", "11.444.777/0001-61"];
    const origens = [`http://127.0.0.1:${PORTA}`, `http://localhost:${PORTA}`];
    for (let i = 0; i < 2; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/empresas",
        headers: { host: HOST, origin: origens[i], ...json },
        payload: JSON.stringify({ ...empresa, cnpj: cnpjs[i] }),
      });
      expect(r.statusCode).toBe(201);
    }
    expect(contarEmpresas()).toBe(2);
  });

  it("origensExtras (modo dev) é aceita só quando configurada", async () => {
    const dev = buildApp({ protecaoLocal: { porta: PORTA, origensExtras: ["http://127.0.0.1:5173"] } });
    const r = await dev.inject({
      method: "GET",
      url: "/api/saude",
      headers: { host: HOST, origin: "http://127.0.0.1:5173" },
    });
    expect(r.statusCode).toBe(200);
  });
});

describe("proteção local: Content-Type", () => {
  it("POST com text/plain -> 415 TIPO_NAO_SUPORTADO e nada executa", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { host: HOST, "content-type": "text/plain" },
      payload: JSON.stringify(empresa),
    });
    expect(r.statusCode).toBe(415);
    expect(r.json().codigo).toBe("TIPO_NAO_SUPORTADO");
    expect(typeof r.json().mensagem).toBe("string");
    expect(contarEmpresas()).toBe(0);
  });

  it("POST duplicar sem corpo e sem Content-Type JSON (form/no-cors) -> 415 e não duplica", async () => {
    const antes = contarConjuntos();
    const variantes = [
      { host: HOST },
      { host: HOST, "content-type": "text/plain" },
      { host: HOST, "content-type": "application/x-www-form-urlencoded" },
      { host: HOST, "content-type": "multipart/form-data; boundary=x" },
    ];
    for (const headers of variantes) {
      const r = await app.inject({ method: "POST", url: `/api/premissas/conjuntos/${conjuntoId}/duplicar`, headers });
      expect(r.statusCode).toBe(415);
    }
    expect(contarConjuntos()).toBe(antes);
    const ok = await app.inject({
      method: "POST",
      url: `/api/premissas/conjuntos/${conjuntoId}/duplicar`,
      headers: { host: HOST, ...json },
      payload: "{}",
    });
    expect(ok.statusCode).toBe(201);
    expect(contarConjuntos()).toBe(antes + 1);
  });

  it("POST recalcular com text/plain -> 415 e o motor não é chamado; com {} JSON funciona", async () => {
    const empresaId = await criarEmpresa();
    const salvo = await app.inject({
      method: "POST",
      url: `/api/empresas/${empresaId}/cenarios`,
      headers: { host: HOST, ...json },
      payload: JSON.stringify({ nome: "Base", operacao: oficial, conjuntoPremissasId: conjuntoId }),
    });
    expect(salvo.statusCode).toBe(201);
    const chamadasAntes = chamadas;
    const negado = await app.inject({
      method: "POST",
      url: `/api/cenarios/${salvo.json().id}/recalcular`,
      headers: { host: HOST, "content-type": "text/plain" },
      payload: "x",
    });
    expect(negado.statusCode).toBe(415);
    expect(chamadas).toBe(chamadasAntes);
    const ok = await app.inject({
      method: "POST",
      url: `/api/cenarios/${salvo.json().id}/recalcular`,
      headers: { host: HOST, ...json },
      payload: "{}",
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().versaoNumero).toBe(2);
  });

  it("DELETE sem Content-Type JSON -> 415; com application/json (corpo vazio) funciona", async () => {
    const id = await criarEmpresa();
    const negado = await app.inject({ method: "DELETE", url: `/api/empresas/${id}`, headers: { host: HOST } });
    expect(negado.statusCode).toBe(415);
    expect(contarEmpresas()).toBe(1);
    const ok = await app.inject({ method: "DELETE", url: `/api/empresas/${id}`, headers: { host: HOST, ...json } });
    expect(ok.statusCode).toBe(204);
    const id2 = await criarEmpresa();
    const comTamanhoZero = await app.inject({
      method: "DELETE",
      url: `/api/empresas/${id2}`,
      headers: { host: HOST, ...json, "content-length": "0" },
    });
    expect(comTamanhoZero.statusCode).toBe(204);
    expect(contarEmpresas()).toBe(0);
  });

  it("application/json; charset=utf-8 é aceito; JSON malformado continua 400", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { host: HOST, "content-type": "application/json; charset=utf-8" },
      payload: JSON.stringify(empresa),
    });
    expect(r.statusCode).toBe(201);
    const ruim = await app.inject({
      method: "POST",
      url: "/api/empresas",
      headers: { host: HOST, ...json },
      payload: "{malformado",
    });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().codigo).toBe("ENTRADA_INVALIDA");
  });

  it("GET não exige Content-Type", async () => {
    const r = await app.inject({ method: "GET", url: "/api/empresas", headers: { host: HOST } });
    expect(r.statusCode).toBe(200);
  });
});

describe("sem a opção protecaoLocal (testes de rota)", () => {
  it("buildApp() mantém o comportamento de antes", async () => {
    const livre = buildApp();
    const r = await livre.inject({ method: "GET", url: "/api/saude", headers: { host: "qualquer" } });
    expect(r.statusCode).toBe(200);
  });
});
