import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import type { OperacaoEntrada } from "../dominio/tipos.js";
import { criarMotores } from "./regimeRegular.js";

const motores = criarMotores(config);
const caminho = new URL("../../test/fixtures/operacao-oficial.json", import.meta.url);
const textoOficial = readFileSync(caminho, "utf8");
const oficial = JSON.parse(textoOficial) as OperacaoEntrada;

function totais(r: Awaited<ReturnType<typeof motores.calcularOperacao>>) {
  const t = (r.total as any).tribCalc;
  return { cbs: t.IBSCBSTot.gCBS.vCBS, ibs: t.IBSCBSTot.gIBS.vIBS, is: t.ISTot.vIS };
}

// Reescreve, no texto do JSON oficial, os números decimais como strings (sem passar por float).
function comoStrings(): OperacaoEntrada {
  const campos = ["baseCalculo", "quantidade", "cbs", "ibsEstadual", "ibsMunicipal", "adValorem", "adRem", "impostoInformado"];
  const re = new RegExp(`"(${campos.join("|")})"\\s*:\\s*(-?[0-9]+(?:\\.[0-9]+)?)`, "g");
  return JSON.parse(textoOficial.replace(re, '"$1": "$2"')) as OperacaoEntrada;
}

describe("motor regular real", () => {
  it("calcula a operação oficial com os totais esperados", async () => {
    const t = totais(await motores.calcularOperacao(oficial));
    expect(t).toEqual({ cbs: "56.76", ibs: "0.64", is: "15.00" });
  });

  it("request com decimais em string dá totais idênticos ao com números", async () => {
    const str = comoStrings();
    expect(typeof str.itens[0]!.baseCalculo).toBe("string");
    expect(typeof str.itens[0]!.aliquotasNominais!.cbs).toBe("string");
    const a = totais(await motores.calcularOperacao(oficial));
    const b = totais(await motores.calcularOperacao(str));
    expect(b).toEqual(a);
  });

  it("entrada inválida vira ENTRADA_INVALIDA", async () => {
    const erro = await motores.calcularOperacao({ id: "x" } as OperacaoEntrada).catch((e) => e);
    expect(erro.codigo).toBe("ENTRADA_INVALIDA");
  });

  it("lista situações e fundamentações", async () => {
    const s = await motores.listarSituacoes("2027-01-01");
    expect(s[0]!.classificacoesTributarias.length).toBeGreaterThan(0);
    const f = await motores.listarFundamentacoes("2027-01-01");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0]!.referenciaNormativa).toBeTypeOf("string");
  });

  it("lê as versões dos dois motores", async () => {
    const v = await motores.versoes();
    expect(v.regimeRegular).toMatch(/^\d/);
    expect(v.simples.app).toBeTruthy();
    expect(v.simples.db).toMatch(/^V\d+/);
  });
});
