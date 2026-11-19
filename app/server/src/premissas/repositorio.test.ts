import { describe, expect, it } from "vitest";
import { abrirBanco } from "../db/banco.js";
import { adicionarPremissa, criarConjunto, duplicarConjunto, listarConjuntos, listarLinhas, validarConjunto } from "./repositorio.js";

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

describe("conjunto validado é imutável", () => {
  const usuario = { origem: "usuario" as const };

  it("aceita linha antes da validação e recusa depois, com 409 CONJUNTO_VALIDADO e sem alterar as linhas", () => {
    const b = abrirBanco(":memory:");
    const c = criarConjunto(b, { nome: "t", vigenciaInicio: "2027-01-01" });
    adicionarPremissa(b, c, { tributo: "CBS", aliquota: "1", ...usuario });
    validarConjunto(b, c, "Ana");
    let erro: unknown;
    try {
      adicionarPremissa(b, c, { tributo: "IS_ADREM", aliquota: "2", ...usuario });
    } catch (e) {
      erro = e;
    }
    expect(erro).toMatchObject({ codigo: "CONJUNTO_VALIDADO", status: 409 });
    expect((erro as Error).message).toMatch(/Duplique-o/);
    expect(listarLinhas(b, c)).toHaveLength(1);
  });

  it("validar de novo continua sobrescrevendo (validar não é editar)", () => {
    const b = abrirBanco(":memory:");
    const c = criarConjunto(b, { nome: "t", vigenciaInicio: "2027-01-01" });
    validarConjunto(b, c, "Ana");
    expect(validarConjunto(b, c, "Bia").validadoPor).toBe("Bia");
  });
});

describe("duplicarConjunto", () => {
  function original() {
    const b = abrirBanco(":memory:");
    const c = criarConjunto(b, { nome: "Base", vigenciaInicio: "2027-01-01", vigenciaFim: "2028-12-31", observacao: "obs" });
    // Linhas sintéticas de teste (fonte inventada só para provar a cópia byte a byte).
    adicionarPremissa(b, c, { tributo: "IBS_UF", aliquota: "0.050", origem: "lei_transicao", fonteNorma: "Norma de teste nº 1", fonteArtigo: "art. 9º, § 2º", consultadoEm: "2026-11-18" });
    adicionarPremissa(b, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    return { b, c };
  }
  const semId = (ls: ReturnType<typeof listarLinhas>) => ls.map(({ id: _id, ...resto }) => resto);

  it("copia conjunto e todas as linhas idênticas, sem validação, mesmo se o original estava validado", () => {
    const { b, c } = original();
    validarConjunto(b, c, "Ana");
    const antes = JSON.stringify(listarLinhas(b, c));
    const novo = duplicarConjunto(b, c);
    expect(novo).not.toBe(c);
    const lista = listarConjuntos(b);
    const copia = lista.find((x) => x.id === novo)!;
    expect(copia).toMatchObject({ nome: "Base (cópia)", vigenciaInicio: "2027-01-01", vigenciaFim: "2028-12-31", observacao: "obs", validadoPor: null, validadoEm: null, linhas: 2 });
    expect(semId(listarLinhas(b, novo))).toEqual(semId(listarLinhas(b, c)));
    expect(JSON.stringify(listarLinhas(b, c))).toBe(antes);
    expect(lista.find((x) => x.id === c)!.validadoPor).toBe("Ana");
    expect(() => adicionarPremissa(b, novo, { tributo: "IS_ADREM", aliquota: "1", origem: "usuario" })).not.toThrow();
  });

  it("nome único quando '(cópia)' já existe", () => {
    const { b, c } = original();
    const n1 = duplicarConjunto(b, c);
    const n2 = duplicarConjunto(b, c);
    const n3 = duplicarConjunto(b, c);
    const nomes = new Map(listarConjuntos(b).map((x) => [x.id, x.nome]));
    expect([nomes.get(n1), nomes.get(n2), nomes.get(n3)]).toEqual(["Base (cópia)", "Base (cópia 2)", "Base (cópia 3)"]);
  });

  it("id inexistente: 404", () => {
    expect(() => duplicarConjunto(abrirBanco(":memory:"), 99)).toThrow(/não encontrado/);
  });

  it("é atômico: se a cópia de uma linha falha, nada fica gravado", () => {
    const { b, c } = original();
    b.exec(
      `CREATE TRIGGER falha_copia BEFORE INSERT ON premissa_aliquota WHEN NEW.conjunto_id <> ${c} AND NEW.tributo = 'CBS' BEGIN SELECT RAISE(ABORT, 'falha forçada'); END;`,
    );
    expect(() => duplicarConjunto(b, c)).toThrow(/falha forçada/);
    expect(listarConjuntos(b)).toHaveLength(1);
    expect((b.prepare("SELECT COUNT(*) AS n FROM premissa_aliquota").get() as { n: number }).n).toBe(2);
  });
});

describe("adicionarPremissa: campos de fonte (m1)", () => {
  const novo = () => {
    const b = abrirBanco(":memory:");
    return { b, c: criarConjunto(b, { nome: "t", vigenciaInicio: "2027-01-01" }) };
  };
  // Linhas sintéticas de teste (não são valores oficiais): só exercitam a validação.
  const base = {
    tributo: "CBS" as const,
    aliquota: "1.0",
    origem: "lei_transicao" as const,
    fonteNorma: "Norma de teste",
    fonteArtigo: "art. de teste",
    consultadoEm: "2026-11-18",
  };
  const mensagem = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return (e as Error).message;
    }
    return "não lançou";
  };

  it("texto só de espaços conta como ausente e a mensagem nomeia o campo", () => {
    const { b, c } = novo();
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, fonteNorma: "   " }))).toMatch(/faltando: fonteNorma/);
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, fonteArtigo: "\t " }))).toMatch(/faltando: fonteArtigo/);
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, consultadoEm: " " }))).toMatch(/faltando: consultadoEm/);
    expect(listarLinhas(b, c)).toHaveLength(0);
  });

  it("consultadoEm precisa ser data ISO válida", () => {
    const { b, c } = novo();
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, consultadoEm: "ontem" }))).toMatch(/consultadoEm inválida/);
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, consultadoEm: "2026-02-30" }))).toMatch(/consultadoEm inválida/);
    expect(listarLinhas(b, c)).toHaveLength(0);
  });

  it("campo de fonte que não é texto é recusado nomeando o campo", () => {
    const { b, c } = novo();
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, fonteNorma: 214 as never }))).toMatch(/fonteNorma inválido: esperado texto/);
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, fonteArtigo: {} as never }))).toMatch(/fonteArtigo inválido/);
    expect(mensagem(() => adicionarPremissa(b, c, { ...base, consultadoEm: 20261118 as never }))).toMatch(/consultadoEm inválido/);
    expect(listarLinhas(b, c)).toHaveLength(0);
  });

  it("valores válidos são gravados sem os espaços das pontas", () => {
    const { b, c } = novo();
    adicionarPremissa(b, c, { ...base, fonteNorma: "  Norma de teste ", consultadoEm: " 2026-11-18 " });
    const [l] = listarLinhas(b, c);
    expect(l!.fonteNorma).toBe("Norma de teste");
    expect(l!.consultadoEm).toBe("2026-11-18");
  });
});
