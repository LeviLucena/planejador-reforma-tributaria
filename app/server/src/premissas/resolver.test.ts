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
    expect({ codigo: e?.codigo, status: e?.status }).toEqual({ codigo: "ENTRADA_INVALIDA", status: 400 });
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
    expect({
      codigo: e?.codigo,
      status: e?.status,
      artigo: e?.message.includes("fonteArtigo"),
      norma: e?.message.includes("fonteNorma"),
      consultado: e?.message.includes("consultadoEm"),
    }).toEqual({ codigo: "ENTRADA_INVALIDA", status: 400, artigo: true, norma: false, consultado: false });
  });

  it("(k2) oficial sem fonteNorma nomeia só fonteNorma", () => {
    const e = erro(() =>
      adicionarPremissa(banco, c, {
        tributo: "CBS", aliquota: "8.8", origem: "oficial", fonteArtigo: "art. 1", consultadoEm: "2026-11-18",
      }),
    );
    expect({
      codigo: e?.codigo,
      norma: e?.message.includes("fonteNorma"),
      artigo: e?.message.includes("fonteArtigo"),
      consultado: e?.message.includes("consultadoEm"),
    }).toEqual({ codigo: "ENTRADA_INVALIDA", norma: true, artigo: false, consultado: false });
  });

  it("(k3) oficial sem consultadoEm nomeia só consultadoEm", () => {
    const e = erro(() =>
      adicionarPremissa(banco, c, {
        tributo: "CBS", aliquota: "8.8", origem: "oficial", fonteNorma: "LC 214/2025", fonteArtigo: "art. 1",
      }),
    );
    expect({
      codigo: e?.codigo,
      consultado: e?.message.includes("consultadoEm"),
      norma: e?.message.includes("fonteNorma"),
      artigo: e?.message.includes("fonteArtigo"),
    }).toEqual({ codigo: "ENTRADA_INVALIDA", consultado: true, norma: false, artigo: false });
  });

  it("(l) origem inválida e tributo inválido têm erro próprio, sem citar fonte ausente", () => {
    const o = erro(() => adicionarPremissa(banco, c, { ...usr("CBS", "8.8"), origem: "xyz" as never }));
    const t = erro(() => adicionarPremissa(banco, c, { ...usr("CBS", "8.8"), tributo: "XYZ" as never }));
    expect({
      o: [o?.codigo, o?.status, /fonte|consultado/i.test(o?.message ?? ""), o?.message.includes("origem")],
      t: [t?.codigo, t?.status, /fonte|consultado/i.test(t?.message ?? ""), t?.message.includes("tributo")],
    }).toEqual({ o: ["ENTRADA_INVALIDA", 400, false, true], t: ["ENTRADA_INVALIDA", 400, false, true] });
  });

  it("(m) duplicata (conjunto, tributo, uf, município) é rejeitada, inclusive CBS nacional", () => {
    adicionarPremissa(banco, c, usr("CBS", "8.8"));
    adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.05"), uf: "SP", municipioIbge: 3550308 });
    const a = erro(() => adicionarPremissa(banco, c, usr("CBS", "9.9")));
    const b = erro(() => adicionarPremissa(banco, c, { ...usr("IBS_MUN", "0.07"), uf: "sp", municipioIbge: 3550308 }));
    const outro = criarConjunto(banco, { nome: "outro", vigenciaInicio: "2027-01-01" });
    expect({
      a: [a?.codigo, a?.status, a?.message.includes("CBS"), a?.message.includes("xiste")],
      b: [b?.codigo, b?.status, b?.message.includes("IBS_MUN"), b?.message.includes("3550308")],
      outroConjunto: erro(() => adicionarPremissa(banco, outro, usr("CBS", "9.9"))),
    }).toEqual({
      a: ["ENTRADA_INVALIDA", 400, true, true],
      b: ["ENTRADA_INVALIDA", 400, true, true],
      outroConjunto: undefined,
    });
  });

  it("(n) data inválida é rejeitada na resolução e na criação do conjunto", () => {
    completo();
    const invalidas = ["abc", "", "2027-13-45", "2027-02-30"];
    const res = invalidas.map((d) => {
      const e = erro(() => resolverAliquotas(banco, c, "SP", 3550308, d));
      return [e?.codigo, e?.status];
    });
    const cri = invalidas.map((d) => {
      const e = erro(() => criarConjunto(banco, { nome: "x", vigenciaInicio: d }));
      return [e?.codigo, e?.status];
    });
    const ok = erro(() => criarConjunto(banco, { nome: "y", vigenciaInicio: "2027-03-01T00:00:00-03:00" }));
    const esperado = invalidas.map(() => ["ENTRADA_INVALIDA", 400]);
    expect({ res, cri, ok }).toEqual({ res: esperado, cri: esperado, ok: undefined });
  });
});

describe("data de término da vigência (vigenciaFim)", () => {
  function conjuntoCompleto(vigenciaFim?: string): number {
    const id = criarConjunto(banco, {
      nome: "com fim",
      vigenciaInicio: "2027-01-01",
      ...(vigenciaFim === undefined ? {} : { vigenciaFim }),
    });
    adicionarPremissa(banco, id, usr("CBS", "8.8"));
    adicionarPremissa(banco, id, usr("IBS_UF", "0.05"));
    adicionarPremissa(banco, id, usr("IBS_MUN", "0.05"));
    return id;
  }

  it("2028-12-31 ainda resolve; 2029-01-01 recusa citando a data de término", () => {
    const id = conjuntoCompleto("2028-12-31");
    expect(erro(() => resolverAliquotas(banco, id, "SP", 3550308, "2028-12-31"))).toBeUndefined();
    expect(erro(() => resolverAliquotas(banco, id, "SP", 3550308, "2028-12-31T23:59:00-03:00"))).toBeUndefined();
    const e = erro(() => resolverAliquotas(banco, id, "SP", 3550308, "2029-01-01"));
    expect([e?.codigo, e?.status, e?.message.includes("2028-12-31"), /não está mais em vigor/.test(e?.message ?? "")]).toEqual([
      "PREMISSA_AUSENTE",
      422,
      true,
      true,
    ]);
    expect(erro(() => resolverAliquotas(banco, id, "SP", 3550308, "2030-01-01"))?.codigo).toBe("PREMISSA_AUSENTE");
  });

  it("conjunto sem vigenciaFim continua resolvendo datas tardias", () => {
    const id = conjuntoCompleto();
    expect(erro(() => resolverAliquotas(banco, id, "SP", 3550308, "2040-06-01"))).toBeUndefined();
  });

  it("criarConjunto grava vigenciaFim e rejeita data inválida ou anterior ao início", () => {
    const id = conjuntoCompleto("2027-12-31");
    expect(banco.prepare("SELECT vigencia_fim FROM conjunto_premissas WHERE id = ?").get(id)).toEqual({
      vigencia_fim: "2027-12-31",
    });
    const invalida = erro(() =>
      criarConjunto(banco, { nome: "x", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-02-30" }),
    );
    const anterior = erro(() =>
      criarConjunto(banco, { nome: "x", vigenciaInicio: "2027-01-01", vigenciaFim: "2026-12-31" }),
    );
    const mesmoDia = erro(() =>
      criarConjunto(banco, { nome: "x", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-01-01" }),
    );
    expect([invalida?.codigo, anterior?.codigo, anterior?.message.includes("vigenciaFim"), mesmoDia]).toEqual([
      "ENTRADA_INVALIDA",
      "ENTRADA_INVALIDA",
      true,
      undefined,
    ]);
  });
});

describe("resolverAliquotas com opcoes.exigir (I2: só o tributo que falta)", () => {
  it("exigir só IS: conjunto sem CBS/IBS resolve o IS; sem IS recusa citando IS", () => {
    adicionarPremissa(banco, c, usr("IS_ADVALOREM", "10.0"));
    const r = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01", { exigir: ["IS"] });
    expect(r).toEqual({ aliquotas: { impostoSeletivo: { adValorem: "10.0" } }, origens: { IS_ADVALOREM: "usuario" } });
    const vazio = criarConjunto(banco, { nome: "vazio", vigenciaInicio: "2027-01-01" });
    const e = erro(() => resolverAliquotas(banco, vazio, "SP", 3550308, "2027-06-01", { exigir: ["IS"] }));
    expect(e?.codigo).toBe("PREMISSA_AUSENTE");
    expect(e?.message).toMatch(/IS \(IS_ADVALOREM ou IS_ADREM\)/);
  });

  it("exigir só CBS: falta de IBS no conjunto não recusa", () => {
    adicionarPremissa(banco, c, usr("CBS", "8.8"));
    const r = resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01", { exigir: ["CBS"] });
    expect(r.aliquotas).toEqual({ cbs: "8.8" });
  });

  it("sem opcoes, o padrão continua exigindo CBS, IBS_UF e IBS_MUN", () => {
    adicionarPremissa(banco, c, usr("IS_ADVALOREM", "10.0"));
    expect(erro(() => resolverAliquotas(banco, c, "SP", 3550308, "2027-06-01"))?.message).toMatch(/CBS/);
  });
});
