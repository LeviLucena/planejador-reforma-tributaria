import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { abrirBanco } from "../db/banco.js";
import type { OperacaoEntrada, ResultadoOperacao } from "../dominio/tipos.js";
import { criarMotores } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "../premissas/repositorio.js";
import { simularOperacao } from "./servico.js";

const motores = criarMotores(config);
const caminho = new URL("../../test/fixtures/operacao-oficial.json", import.meta.url);
const oficial = JSON.parse(readFileSync(caminho, "utf8")) as OperacaoEntrada;

function totais(r: ResultadoOperacao) {
  const t = (r.total as any).tribCalc;
  return { cbs: t.IBSCBSTot.gCBS.vCBS, ibs: t.IBSCBSTot.gIBS.vIBS, is: t.ISTot.vIS };
}

describe("simularOperacao com o motor real", () => {
  it("operação oficial sem alíquotas nos itens + premissas do usuário → totais oficiais", async () => {
    const banco = abrirBanco(":memory:");
    const c = criarConjunto(banco, { nome: "cenário do usuário", vigenciaInicio: "2027-01-01" });
    adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
    adicionarPremissa(banco, c, {
      tributo: "IBS_MUN",
      aliquota: "0.05",
      uf: "RS",
      municipioIbge: 4314902,
      origem: "usuario",
    });
    adicionarPremissa(banco, c, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });

    const op = structuredClone(oficial);
    for (const item of op.itens) delete item.aliquotasNominais;

    const r = await simularOperacao({ motores, banco }, { operacao: op, conjuntoPremissasId: c });
    expect(totais(r.resultado)).toEqual({ cbs: "56.76", ibs: "0.64", is: "15.00" });
    const obj = r.resultado.objetos;
    expect(obj.slice(0, 3).map((o) => o.estadoItem)).toEqual([
      "CALCULO_SIMULADO",
      "CALCULO_SIMULADO",
      "CALCULO_SIMULADO",
    ]);
    expect(obj[3]!.estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(obj[3]!.erros!.map((e) => e.code)).toContain("REG-011");
    expect(r.origensPremissas).toEqual({
      CBS: "usuario",
      IBS_UF: "usuario",
      IBS_MUN: "usuario",
      IS_ADVALOREM: "usuario",
    });
  });

  it("com as alíquotas do próprio request e conjunto vazio, dá os mesmos totais (resolução preguiçosa)", async () => {
    const banco = abrirBanco(":memory:");
    const c = criarConjunto(banco, { nome: "vazio", vigenciaInicio: "2027-01-01" });
    const r = await simularOperacao(
      { motores, banco },
      { operacao: structuredClone(oficial), conjuntoPremissasId: c },
    );
    expect(totais(r.resultado)).toEqual({ cbs: "56.76", ibs: "0.64", is: "15.00" });
    expect(r.origensPremissas).toEqual({});
  });
});
