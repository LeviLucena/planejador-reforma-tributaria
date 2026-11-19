import { describe, expect, it } from "vitest";
import { abrirBanco } from "../db/banco.js";
import { adicionarPremissa, criarConjunto, listarConjuntos } from "./repositorio.js";

describe("listarConjuntos", () => {
  it("vazio quando não há conjuntos", () => {
    expect(listarConjuntos(abrirBanco(":memory:"))).toEqual([]);
  });

  it("devolve conjuntos em ordem de id com a contagem de linhas e a validação", () => {
    const b = abrirBanco(":memory:");
    const a = criarConjunto(b, { nome: "a", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-12-31" });
    const c = criarConjunto(b, { nome: "b", vigenciaInicio: "2028-01-01" });
    adicionarPremissa(b, a, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    adicionarPremissa(b, a, { tributo: "IBS_UF", uf: "RS", aliquota: "0.05", origem: "usuario" });
    b.prepare("UPDATE conjunto_premissas SET validado_por = 'Ana', validado_em = '2026-11-18' WHERE id = ?").run(a);
    expect(listarConjuntos(b)).toEqual([
      { id: a, nome: "a", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-12-31", observacao: null, validadoPor: "Ana", validadoEm: "2026-11-18", linhas: 2 },
      { id: c, nome: "b", vigenciaInicio: "2028-01-01", vigenciaFim: null, observacao: null, validadoPor: null, validadoEm: null, linhas: 0 },
    ]);
  });
});

describe("adicionarPremissa: endurecimento", () => {
  const novo = () => {
    const b = abrirBanco(":memory:");
    return { b, c: criarConjunto(b, { nome: "t", vigenciaInicio: "2027-01-01" }) };
  };
  // Linhas sintéticas: premissas do próprio usuário (origem "usuario"), sem valor oficial.
  const usuario = { origem: "usuario" as const };

  it("rejeita IBS_UF com município", () => {
    const { b, c } = novo();
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_UF", uf: "RS", municipioIbge: 4314902, aliquota: "1", ...usuario })).toThrow(/municipioIbge/);
  });
  it("rejeita IBS_MUN com município sem uf, mas aceita o fallback nacional (sem uf e sem município)", () => {
    const { b, c } = novo();
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_MUN", municipioIbge: 4314902, aliquota: "1", ...usuario })).toThrow(/uf/);
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_MUN", aliquota: "1", ...usuario })).not.toThrow();
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_UF", aliquota: "1", ...usuario })).not.toThrow();
  });
  it("rejeita UF fora das 27 siglas", () => {
    const { b, c } = novo();
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_UF", uf: "XX", aliquota: "1", ...usuario })).toThrow(/uf/);
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_UF", uf: "rs", aliquota: "1", ...usuario })).not.toThrow();
  });
  it("exige município inteiro de exatamente 7 dígitos", () => {
    const { b, c } = novo();
    for (const m of [123456, 12345678, 4314902.5, 0, -4314902]) {
      expect(() => adicionarPremissa(b, c, { tributo: "IBS_MUN", uf: "RS", municipioIbge: m, aliquota: "1", ...usuario })).toThrow(/municipioIbge/);
    }
    expect(() => adicionarPremissa(b, c, { tributo: "IBS_MUN", uf: "RS", municipioIbge: 4314902, aliquota: "1", ...usuario })).not.toThrow();
  });
  it("exige alíquota decimal em texto entre 0 e 100, comparada sem Number", () => {
    const { b, c } = novo();
    for (const a of ["", "abc", "-1", "1,5", ".5", "5.", "100.01", "101", "1000", "100.0001", "0100.5"]) {
      expect(() => adicionarPremissa(b, c, { tributo: "CBS", aliquota: a, ...usuario }), a).toThrow(/aliquota/);
    }
    for (const a of ["0", "0.05", "8.8", "100", "100.0", "100.000", "007"]) {
      const outro = criarConjunto(b, { nome: a, vigenciaInicio: "2027-01-01" });
      expect(() => adicionarPremissa(b, outro, { tributo: "CBS", aliquota: a, ...usuario }), a).not.toThrow();
    }
  });
});
