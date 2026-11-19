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
