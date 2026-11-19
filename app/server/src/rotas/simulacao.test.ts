import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio, MOTOR_INDISPONIVEL } from "../dominio/erros.js";
import type { OperacaoEntrada } from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "../premissas/repositorio.js";

let banco: Banco;
let chamadas: OperacaoEntrada[];
let falha: Error | undefined;

const motores = {
  async calcularOperacao(op: OperacaoEntrada) {
    chamadas.push(op);
    if (falha) throw falha;
    return { objetos: [], total: {} };
  },
} as unknown as MotoresPort;

function operacao(): OperacaoEntrada {
  return {
    id: "op1",
    versao: "1.0.0",
    dhFatoGerador: "2027-03-10T10:00:00-03:00",
    municipio: 4314902,
    uf: "RS",
    itens: [{ numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: "100" }],
  };
}

function conjuntoCompleto(): number {
  const c = criarConjunto(banco, { nome: "t", vigenciaInicio: "2027-01-01" });
  adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
  adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
  adicionarPremissa(banco, c, {
    tributo: "IBS_MUN",
    aliquota: "0.05",
    uf: "RS",
    municipioIbge: 4314902,
    origem: "usuario",
  });
  return c;
}

beforeEach(() => {
  banco = abrirBanco(":memory:");
  chamadas = [];
  falha = undefined;
});

async function postar(app: ReturnType<typeof buildApp>, corpo: unknown) {
  return app.inject({ method: "POST", url: "/api/simular", payload: corpo as object });
}

describe("POST /api/simular", () => {
  it("simula e devolve resultado, entrada enviada e origens das premissas", async () => {
    const c = conjuntoCompleto();
    const app = buildApp({ motores, banco });
    const r = await postar(app, { operacao: operacao(), conjuntoPremissasId: c });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.resultado).toEqual({ objetos: [], total: {} });
    expect(j.entradaEnviada.itens[0].aliquotasNominais).toEqual({
      cbs: "8.8",
      ibsEstadual: "0.05",
      ibsMunicipal: "0.05",
    });
    expect(j.origensPremissas).toEqual({ CBS: "usuario", IBS_UF: "usuario", IBS_MUN: "usuario" });
  });

  it("a rota só existe quando motores e banco são fornecidos", async () => {
    const r = await postar(buildApp(), { operacao: operacao(), conjuntoPremissasId: 1 });
    expect(r.statusCode).toBe(404);
  });

  const casos: [string, (o: any, b: any) => void, string][] = [
    ["itens vazio", (o) => (o.itens = []), "itens"],
    ["itens ausente", (o) => delete o.itens, "itens"],
    ["uf inexistente", (o) => (o.uf = "XX"), "uf"],
    ["uf minúscula", (o) => (o.uf = "rs"), "uf"],
    ["município com 6 dígitos", (o) => (o.municipio = 431490), "municipio"],
    ["município não inteiro", (o) => (o.municipio = "4314902"), "municipio"],
    ["data sem deslocamento", (o) => (o.dhFatoGerador = "2027-03-10T10:00:00"), "dhFatoGerador"],
    ["data inexistente", (o) => (o.dhFatoGerador = "2027-02-30T10:00:00-03:00"), "dhFatoGerador"],
    ["cst com 2 dígitos", (o) => (o.itens[0].cst = "20"), "cst"],
    ["cClassTrib com 5 dígitos", (o) => (o.itens[0].cClassTrib = "20000"), "cClassTrib"],
    ["numero não inteiro", (o) => (o.itens[0].numero = 1.5), "numero"],
    ["ncm e nbs juntos", (o) => (o.itens[0].nbs = "122011200"), "ncm"],
    ["nem ncm nem nbs", (o) => delete o.itens[0].ncm, "ncm"],
    ["ncm com 7 dígitos", (o) => (o.itens[0].ncm = "1006302"), "ncm"],
    ["id não string", (o) => (o.id = 5), "id"],
    ["versao não string", (o) => (o.versao = 5), "versao"],
    ["conjunto zero", (_o, b) => (b.conjuntoPremissasId = 0), "conjuntoPremissasId"],
    ["conjunto não inteiro", (_o, b) => (b.conjuntoPremissasId = "1"), "conjuntoPremissasId"],
    ["operacao ausente", (_o, b) => delete b.operacao, "operacao"],
  ];
  for (const [nome, mexer, campo] of casos) {
    it(`400 ENTRADA_INVALIDA: ${nome}`, async () => {
      const c = conjuntoCompleto();
      const app = buildApp({ motores, banco });
      const op = operacao();
      const corpo: any = { operacao: op, conjuntoPremissasId: c };
      mexer(op, corpo);
      const r = await postar(app, corpo);
      expect(r.statusCode).toBe(400);
      expect(r.json().codigo).toBe("ENTRADA_INVALIDA");
      expect(r.json().mensagem).toContain(campo);
      expect(chamadas).toHaveLength(0);
    });
  }

  it("JSON malformado → 400", async () => {
    const app = buildApp({ motores, banco });
    const r = await app.inject({
      method: "POST",
      url: "/api/simular",
      headers: { "content-type": "application/json" },
      payload: "{malformado",
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe("ENTRADA_INVALIDA");
  });

  it("conjunto desconhecido → ErroDominio PREMISSA_AUSENTE 422, nunca erro de banco", async () => {
    const app = buildApp({ motores, banco });
    const r = await postar(app, { operacao: operacao(), conjuntoPremissasId: 424242 });
    expect(r.statusCode).toBe(422);
    expect(r.json().codigo).toBe("PREMISSA_AUSENTE");
    expect(chamadas).toHaveLength(0);
  });

  it("MOTOR_INDISPONIVEL → 503 com a mensagem do motor", async () => {
    const c = conjuntoCompleto();
    falha = new ErroDominio(MOTOR_INDISPONIVEL, "Motor fora do ar.", 503);
    const r = await postar(buildApp({ motores, banco }), { operacao: operacao(), conjuntoPremissasId: c });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ codigo: "MOTOR_INDISPONIVEL", mensagem: "Motor fora do ar." });
  });
});

describe("tratamento global de erros e rotas", () => {
  it("rota desconhecida → 404 NAO_ENCONTRADO no formato {codigo, mensagem}", async () => {
    const r = await buildApp().inject({ method: "GET", url: "/api/nada" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ codigo: "NAO_ENCONTRADO", mensagem: "Rota não encontrada." });
  });

  it("erro inesperado é registrado no log e a resposta é genérica", async () => {
    const app = buildApp();
    const espiao = vi.spyOn(app.log, "error");
    app.get("/teste/boom", async () => {
      throw new Error("segredo interno");
    });
    const r = await app.inject({ method: "GET", url: "/teste/boom" });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
    expect(espiao).toHaveBeenCalledTimes(1);
  });

  it("ErroDominio 5xx (exceto MOTOR_INDISPONIVEL) não expõe a própria mensagem", async () => {
    const app = buildApp();
    app.get("/teste/dom500", async () => {
      throw new ErroDominio("FALHA_X", "detalhe sensível", 500);
    });
    const r = await app.inject({ method: "GET", url: "/teste/dom500" });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
    expect(r.body).not.toContain("sensível");
  });

  it("MOTOR_INDISPONIVEL mantém a mensagem", async () => {
    const app = buildApp();
    app.get("/teste/mi", async () => {
      throw new ErroDominio(MOTOR_INDISPONIVEL, "Motor fora do ar.", 503);
    });
    const r = await app.inject({ method: "GET", url: "/teste/mi" });
    expect(r.statusCode).toBe(503);
    expect(r.json().mensagem).toBe("Motor fora do ar.");
  });
});
