import { beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio } from "../dominio/erros.js";
import { adicionarPremissa, criarConjunto, type PremissaEntrada } from "./repositorio.js";
import { resolverAliquotas } from "./resolver.js";

let banco: Banco;
let c: number;

const usr = (tributo: PremissaEntrada["tributo"], aliquota: string): PremissaEntrada => ({
  tributo,
  aliquota,
  origem: "usuario",
});

function erro(fn: () => unknown): ErroDominio | undefined {
  try {
    fn();
  } catch (e) {
    return e as ErroDominio;
  }
  return undefined;
}

beforeEach(() => {
  banco = abrirBanco(":memory:");
  c = criarConjunto(banco, { nome: "teste", vigenciaInicio: "2027-01-01" });
});

function completo() {
  adicionarPremissa(banco, c, usr("CBS", "8.8"));
  adicionarPremissa(banco, c, { ...usr("IBS_UF", "0.1"), uf: "SP" });
  adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.05"), uf: "SP", municipioIbge: 3550308 });
}

describe("resolverAliquotas", () => {
  it("(a) conjunto completo resolve e informa origens", () => {
    completo();
    const r = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01");
    expect(r).toEqual({
      aliquotas: { cbs: "8.8", ibsEstadual: "0.1", ibsMunicipal: "0.05" },
      origens: { CBS: "usuario", IBS_UF: "usuario", IBS_MUN: "usuario" },
    });
  });

  it("(b) sem IBS_MUN lança PREMISSA_AUSENTE citando IBS_MUN", () => {
    adicionarPremissa(banco, c, usr("CBS", "8.8"));
    adicionarPremissa(banco, c, { ...usr("IBS_UF", "0.1"), uf: "SP" });
    const e = erro(() => resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01"));
    expect({ codigo: e?.codigo, status: e?.status, cita: e?.message.includes("IBS_MUN") }).toEqual({
      codigo: "PREMISSA_AUSENTE",
      status: 422,
      cita: true,
    });
  });

  it("(c) município vence UF, que vence nacional", () => {
    completo();
    adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.02"), uf: "SP" });
    adicionarPremissa(banco, c, usr("IBS_MUN", "0.01"));
    adicionarPremissa(banco, c, usr("IBS_UF", "0.3"));
    const a = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01").aliquotas;
    const b = resolverAliquotas(banco, c, "SP", 3509502, "2027-06-01").aliquotas;
    const d = resolverAliquotas(banco, c, "RJ", 3304557, "2027-06-01").aliquotas;
    expect([a.ibsMunicipal, a.ibsEstadual]).toEqual(["0.05", "0.1"]);
    expect(b.ibsMunicipal).toBe("0.02");
    expect([d.ibsMunicipal, d.ibsEstadual]).toEqual(["0.01", "0.3"]);
  });

  it("(d) data anterior à vigência lança PREMISSA_AUSENTE", () => {
    completo();
    const e = erro(() => resolverAliquotas(banco, c, "SP", 3550308, "2026-12-31"));
    expect(e?.codigo).toBe("PREMISSA_AUSENTE");
  });

  it("(d2) datetime ISO compara só a data", () => {
    completo();
    expect(erro(() => resolverAliquotas(banco, c, "SP", 3550308, "2027-01-01T00:00:00-03:00"))).toBeUndefined();
  });

  it("(f) alíquotas voltam como string exatamente como gravadas", () => {
    adicionarPremissa(banco, c, usr("CBS", "8.80"));
    adicionarPremissa(banco, c, { ...usr("IBS_UF", "0.050"), uf: "SP" });
    adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.088"), uf: "SP", municipioIbge: 3550308 });
    const a = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01").aliquotas;
    expect([a.cbs, a.ibsEstadual, a.ibsMunicipal]).toEqual(["8.80", "0.050", "0.088"]);
    expect([typeof a.cbs, typeof a.ibsEstadual, typeof a.ibsMunicipal]).toEqual(["string", "string", "string"]);
  });

  it("(g) origens reflete a origem gravada por tributo", () => {
    adicionarPremissa(banco, c, {
      tributo: "CBS",
      aliquota: "8.8",
      origem: "oficial",
      fonteNorma: "LC 214/2025",
      fonteArtigo: "art. 1",
      consultadoEm: "2026-11-18",
    });
    adicionarPremissa(banco, c, {
      tributo: "IBS_UF",
      aliquota: "0.1",
      origem: "lei_transicao",
      uf: "SP",
      fonteNorma: "LC 214/2025",
      fonteArtigo: "art. 2",
      consultadoEm: "2026-11-18",
    });
    adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.05"), uf: "SP", municipioIbge: 3550308 });
    expect(resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01").origens).toEqual({
      CBS: "oficial",
      IBS_UF: "lei_transicao",
      IBS_MUN: "usuario",
    });
  });

  it("(h) IS opcional aparece só quando gravado e ausência não gera erro", () => {
    completo();
    const sem = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01");
    adicionarPremissa(banco, c, usr("IS_ADVALOREM", "5"));
    const com = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01");
    expect({
      sem: "impostoSeletivo" in sem.aliquotas,
      com: com.aliquotas.impostoSeletivo,
      origem: com.origens.IS_ADVALOREM,
    }).toEqual({ sem: false, com: { adValorem: "5" }, origem: "usuario" });
  });

  it("(i) CBS com uf é rejeitada", () => {
    const e = erro(() => adicionarPremissa(banco, c, { ...usr("CBS", "8.8"), uf: "SP" }));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
  });

  it("(j) sp e SP resolvem igual", () => {
    completo();
    const a = resolverAliquotas(banco, c, "sp", 3550308, "2027-06-01");
    const b = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01");
    expect(a).toEqual(b);
  });

  it("(k) oficial sem fonteArtigo é rejeitada com ENTRADA_INVALIDA citando o campo", () => {
    const e = erro(() =>
      adicionarPremissa(banco, c, {
        tributo: "CBS",
        aliquota: "8.8",
        origem: "oficial",
        fonteNorma: "LC 214/2025",
        consultadoEm: "2026-11-18",
      }),
    );
    expect({ codigo: e?.codigo, status: e?.status, cita: e?.message.includes("fonte_artigo") }).toEqual({
      codigo: "ENTRADA_INVALIDA",
      status: 400,
      cita: true,
    });
  });
});
