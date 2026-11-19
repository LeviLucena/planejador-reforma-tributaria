import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio, MOTOR_INDISPONIVEL } from "../dominio/erros.js";
import type { OperacaoEntrada, ResultadoOperacao } from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "../premissas/repositorio.js";

const ler = (n: string) => readFileSync(new URL(`../../test/fixtures/${n}`, import.meta.url), "utf8");
const oficial = JSON.parse(ler("operacao-oficial.json")) as OperacaoEntrada;
const respostaOficial = JSON.parse(ler("resposta-oficial.json")) as ResultadoOperacao;

let banco: Banco;
let falha: Error | undefined;
let chamadas: number;
const motores = {
  async calcularOperacao() {
    chamadas++;
    if (falha) throw falha;
    return structuredClone(respostaOficial);
  },
  async versoes() {
    return { regimeRegular: "1.6.1+V0059", simples: { app: "0.0.6", db: "V0059" } };
  },
} as unknown as MotoresPort;

const empresa = {
  razaoSocial: "Padaria Exemplo Ltda",
  cnpj: "11.222.333/0001-81",
  regimeAtual: "presumido",
  uf: "RS",
  municipioIbge: "4314902",
};

let conjuntoId: number;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  banco = abrirBanco(":memory:");
  falha = undefined;
  chamadas = 0;
  conjuntoId = criarConjunto(banco, { nome: "t", vigenciaInicio: "2027-01-01" });
  adicionarPremissa(banco, conjuntoId, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
  adicionarPremissa(banco, conjuntoId, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
  adicionarPremissa(banco, conjuntoId, {
    tributo: "IBS_MUN",
    aliquota: "0.05",
    uf: "RS",
    municipioIbge: 4314902,
    origem: "usuario",
  });
  adicionarPremissa(banco, conjuntoId, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });
  app = buildApp({ motores, banco });
});

async function novaEmpresa(corpo: object = empresa): Promise<number> {
  const r = await app.inject({ method: "POST", url: "/api/empresas", payload: corpo });
  expect(r.statusCode).toBe(201);
  return r.json().id;
}

function operacaoSemAliquotas(): OperacaoEntrada {
  const op = structuredClone(oficial);
  for (const item of op.itens) delete item.aliquotasNominais;
  return op;
}

const salvar = (empresaId: number, nome = "Base") =>
  app.inject({
    method: "POST",
    url: `/api/empresas/${empresaId}/cenarios`,
    payload: { nome, operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
  });

describe("rotas de empresas", () => {
  it("POST 201 grava só os dígitos do CNPJ; GET lista e obtém", async () => {
    const id = await novaEmpresa();
    const um = await app.inject({ method: "GET", url: `/api/empresas/${id}` });
    expect(um.statusCode).toBe(200);
    expect(um.json().cnpj).toBe("11222333000181");
    const todas = await app.inject({ method: "GET", url: "/api/empresas" });
    expect(todas.json()).toHaveLength(1);
  });

  it("400 para CNPJ inválido e para CNPJ duplicado", async () => {
    const ruim = await app.inject({ method: "POST", url: "/api/empresas", payload: { ...empresa, cnpj: "11.222.333/0001-82" } });
    expect(ruim.statusCode).toBe(400);
    expect(ruim.json().codigo).toBe("ENTRADA_INVALIDA");
    await novaEmpresa();
    const dup = await app.inject({ method: "POST", url: "/api/empresas", payload: empresa });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().codigo).toBe("ENTRADA_INVALIDA");
  });

  it("corpo que não é objeto → 400", async () => {
    const r = await app.inject({ method: "POST", url: "/api/empresas", payload: [1] });
    expect(r.statusCode).toBe(400);
  });

  it("PUT 200, DELETE 204 e depois 404", async () => {
    const id = await novaEmpresa();
    const put = await app.inject({ method: "PUT", url: `/api/empresas/${id}`, payload: { ...empresa, razaoSocial: "Nova" } });
    expect(put.statusCode).toBe(200);
    expect(put.json().razaoSocial).toBe("Nova");
    const del = await app.inject({ method: "DELETE", url: `/api/empresas/${id}` });
    expect(del.statusCode).toBe(204);
    const dep = await app.inject({ method: "GET", url: `/api/empresas/${id}` });
    expect(dep.statusCode).toBe(404);
    expect(dep.json().codigo).toBe("NAO_ENCONTRADO");
    expect((await app.inject({ method: "DELETE", url: `/api/empresas/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/empresas/${id}`, payload: empresa })).statusCode).toBe(404);
  });

  it("id inválido (não inteiro) → 404 NAO_ENCONTRADO", async () => {
    for (const id of ["abc", "1.5", "-1", "0", "1e3"]) {
      const r = await app.inject({ method: "GET", url: `/api/empresas/${id}` });
      expect(r.statusCode).toBe(404);
      expect(r.json().codigo).toBe("NAO_ENCONTRADO");
    }
  });

  it("as rotas de empresas só existem com banco", async () => {
    const r = await buildApp().inject({ method: "GET", url: "/api/empresas" });
    expect(r.statusCode).toBe(404);
  });
});

describe("rotas de cenários", () => {
  it("POST 201 salva; GET /cenarios/:id reabre igual; lista traz a versão", async () => {
    const empresaId = await novaEmpresa();
    const r = await salvar(empresaId);
    expect(r.statusCode).toBe(201);
    const c = r.json();
    expect(c.versaoNumero).toBe(1);
    expect(c.resultado).toEqual(respostaOficial);
    chamadas = 0;
    const g = await app.inject({ method: "GET", url: `/api/cenarios/${c.id}` });
    expect(g.statusCode).toBe(200);
    expect(g.json()).toEqual(c);
    expect(chamadas).toBe(0);
    const l = await app.inject({ method: "GET", url: `/api/empresas/${empresaId}/cenarios` });
    expect(l.json()).toHaveLength(1);
  });

  it("reabrir funciona mesmo com o motor fora do ar", async () => {
    const empresaId = await novaEmpresa();
    const c = (await salvar(empresaId)).json();
    falha = new ErroDominio(MOTOR_INDISPONIVEL, "fora do ar", 503);
    const g = await app.inject({ method: "GET", url: `/api/cenarios/${c.id}` });
    expect(g.statusCode).toBe(200);
    expect(g.json().resultado).toEqual(respostaOficial);
  });

  it("nome duplicado → 400; empresa inexistente → 404", async () => {
    const empresaId = await novaEmpresa();
    await salvar(empresaId);
    const dup = await salvar(empresaId);
    expect(dup.statusCode).toBe(400);
    expect(dup.json().codigo).toBe("ENTRADA_INVALIDA");
    expect((await salvar(999)).statusCode).toBe(404);
  });

  it("MOTOR_INDISPONIVEL → 503 e nada é gravado", async () => {
    const empresaId = await novaEmpresa();
    falha = new ErroDominio(MOTOR_INDISPONIVEL, "fora do ar", 503);
    const r = await salvar(empresaId);
    expect(r.statusCode).toBe(503);
    falha = undefined;
    const l = await app.inject({ method: "GET", url: `/api/empresas/${empresaId}/cenarios` });
    expect(l.json()).toEqual([]);
  });

  it("validação da operação é a mesma de /api/simular (400, sem chamar o motor)", async () => {
    const empresaId = await novaEmpresa();
    const op: any = operacaoSemAliquotas();
    op.uf = "XX";
    const r = await app.inject({
      method: "POST",
      url: `/api/empresas/${empresaId}/cenarios`,
      payload: { nome: "A", operacao: op, conjuntoPremissasId: conjuntoId },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toContain("uf");
    const semNome = await app.inject({
      method: "POST",
      url: `/api/empresas/${empresaId}/cenarios`,
      payload: { operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
    });
    expect(semNome.statusCode).toBe(400);
    expect(semNome.json().mensagem).toContain("nome");
    const semConj = await app.inject({
      method: "POST",
      url: `/api/empresas/${empresaId}/cenarios`,
      payload: { nome: "A", operacao: operacaoSemAliquotas(), conjuntoPremissasId: 0 },
    });
    expect(semConj.statusCode).toBe(400);
    expect(chamadas).toBe(0);
  });

  it("POST /cenarios/:id/recalcular → 201 versão 2; v1 segue igual", async () => {
    const empresaId = await novaEmpresa();
    const v1 = (await salvar(empresaId)).json();
    const r = await app.inject({ method: "POST", url: `/api/cenarios/${v1.id}/recalcular` });
    expect(r.statusCode).toBe(201);
    expect(r.json().versaoNumero).toBe(2);
    const de1 = await app.inject({ method: "GET", url: `/api/cenarios/${v1.id}` });
    expect(de1.json()).toEqual(v1);
  });

  it("ids inválidos ou inexistentes → 404 NAO_ENCONTRADO", async () => {
    for (const [metodo, url] of [
      ["GET", "/api/cenarios/abc"],
      ["GET", "/api/cenarios/999"],
      ["POST", "/api/cenarios/abc/recalcular"],
      ["POST", "/api/cenarios/999/recalcular"],
      ["GET", "/api/empresas/abc/cenarios"],
      ["GET", "/api/empresas/999/cenarios"],
    ] as const) {
      const r = await app.inject({ method: metodo, url });
      expect(r.statusCode, `${metodo} ${url}`).toBe(404);
      expect(r.json().codigo).toBe("NAO_ENCONTRADO");
    }
  });

  it("excluir a empresa apaga os cenários (GET do cenário → 404)", async () => {
    const empresaId = await novaEmpresa();
    const c = (await salvar(empresaId)).json();
    await app.inject({ method: "DELETE", url: `/api/empresas/${empresaId}` });
    expect((await app.inject({ method: "GET", url: `/api/cenarios/${c.id}` })).statusCode).toBe(404);
  });

  it("as rotas de cenários só existem com motores e banco", async () => {
    const so = buildApp({ banco });
    expect((await so.inject({ method: "GET", url: "/api/cenarios/1" })).statusCode).toBe(404);
  });
});
