import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio } from "../dominio/erros.js";
import { CAMPOS_CONJUNTO, CAMPOS_LINHA, carregarArquivo } from "./carregador.js";

let banco: Banco;
let pasta: string;

beforeEach(() => {
  banco = abrirBanco(":memory:");
  pasta = mkdtempSync(join(tmpdir(), "carregador-premissas-"));
});

afterEach(() => {
  banco.close();
  rmSync(pasta, { recursive: true, force: true });
});

function escrever(nome: string, conteudo: unknown): string {
  const caminho = join(pasta, nome);
  writeFileSync(caminho, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo), "utf8");
  return caminho;
}

function contagens() {
  const n = (t: string) => (banco.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  return { conjuntos: n("conjunto_premissas"), linhas: n("premissa_aliquota") };
}

function erro(fn: () => unknown): ErroDominio | undefined {
  try {
    fn();
  } catch (e) {
    return e as ErroDominio;
  }
  return undefined;
}

const conjunto = { nome: "teste do usuário", vigenciaInicio: "2027-01-01" };

const linhasUsuario = [
  { tributo: "CBS", aliquota: "8.8", origem: "usuario" },
  { tributo: "IBS_UF", uf: "SP", aliquota: "0.1", origem: "usuario" },
  { tributo: "IBS_MUN", uf: "SP", municipioIbge: 3550308, aliquota: "0.05", origem: "usuario" },
];

const linhaOficial = {
  tributo: "CBS",
  aliquota: "0.9",
  origem: "lei_transicao",
  // dados fictícios de teste (banco em memória); não representam norma real
  fonteNorma: "Norma fictícia de teste",
  fonteArtigo: "art. fictício",
  consultadoEm: "2026-11-18",
};

describe("carregarArquivo", () => {
  it("rejeita linha oficial sem fonteArtigo e não grava nada (nem o conjunto)", () => {
    const { fonteArtigo: _omitido, ...semArtigo } = linhaOficial;
    const caminho = escrever("sem-artigo.json", {
      conjunto,
      linhas: [linhasUsuario[1], semArtigo],
    });
    const antes = contagens();
    const e = erro(() => carregarArquivo(banco, caminho));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
    expect(e?.message).toContain("linha 1");
    expect(e?.message).toContain("fonteArtigo");
    expect(contagens()).toEqual(antes);
  });

  it("rejeita lei_transicao sem fonteNorma e oficial sem consultadoEm", () => {
    const { fonteNorma: _a, ...semNorma } = linhaOficial;
    const { consultadoEm: _b, ...semData } = { ...linhaOficial, origem: "oficial" };
    for (const [i, linha, campo] of [
      [0, semNorma, "fonteNorma"],
      [0, semData, "consultadoEm"],
    ] as const) {
      const e = erro(() => carregarArquivo(banco, escrever(`f${campo}.json`, { conjunto, linhas: [linha] })));
      expect(e?.codigo).toBe("ENTRADA_INVALIDA");
      expect(e?.message).toContain(`linha ${i}`);
      expect(e?.message).toContain(campo);
    }
    expect(contagens()).toEqual({ conjuntos: 0, linhas: 0 });
  });

  it("arquivo válido só com origem usuario grava N linhas num conjunto novo", () => {
    const caminho = escrever("usuario.json", {
      conjunto: { ...conjunto, observacao: "cenário próprio" },
      linhas: linhasUsuario,
    });
    const r = carregarArquivo(banco, caminho);
    expect(r.linhas).toBe(3);
    expect(contagens()).toEqual({ conjuntos: 1, linhas: 3 });
    const c = banco.prepare("SELECT * FROM conjunto_premissas WHERE id = ?").get(r.conjuntoId) as Record<
      string,
      unknown
    >;
    expect(c).toMatchObject({ nome: "teste do usuário", vigencia_inicio: "2027-01-01", observacao: "cenário próprio" });
    const mun = banco
      .prepare("SELECT aliquota, municipio_ibge FROM premissa_aliquota WHERE tributo = 'IBS_MUN'")
      .get() as { aliquota: string; municipio_ibge: string };
    expect(mun).toEqual({ aliquota: "0.05", municipio_ibge: "3550308" });
  });

  it("JSON malformado gera ENTRADA_INVALIDA", () => {
    const e = erro(() => carregarArquivo(banco, escrever("ruim.json", "{ conjunto: ")));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
    expect(contagens()).toEqual({ conjuntos: 0, linhas: 0 });
  });

  it("arquivo inexistente gera ENTRADA_INVALIDA", () => {
    const e = erro(() => carregarArquivo(banco, join(pasta, "nao-existe.json")));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
  });

  it("campo desconhecido numa linha é rejeitado (esquema estrito)", () => {
    const caminho = escrever("extra.json", {
      conjunto,
      linhas: [linhasUsuario[0], { ...linhasUsuario[1], validadoPor: "alguém" }],
    });
    const e = erro(() => carregarArquivo(banco, caminho));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
    expect(e?.message).toContain("linha 1");
    expect(e?.message).toContain("validadoPor");
    expect(contagens()).toEqual({ conjuntos: 0, linhas: 0 });
  });

  it("campo desconhecido no conjunto ou na raiz é rejeitado", () => {
    const e1 = erro(() =>
      carregarArquivo(banco, escrever("c.json", { conjunto: { ...conjunto, validado_por: "x" }, linhas: [] })),
    );
    expect(e1?.message).toContain("validado_por");
    const e2 = erro(() => carregarArquivo(banco, escrever("r.json", { conjunto, linhas: [], extra: 1 })));
    expect(e2?.message).toContain("extra");
    expect(contagens()).toEqual({ conjuntos: 0, linhas: 0 });
  });

  it("alíquota numérica (não string) é rejeitada", () => {
    const e = erro(() =>
      carregarArquivo(banco, escrever("num.json", { conjunto, linhas: [{ ...linhasUsuario[0], aliquota: 8.8 }] })),
    );
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
    expect(e?.message).toContain("linha 0");
    expect(e?.message).toContain("aliquota");
  });

  it("linhas duplicadas são rejeitadas de forma atômica", () => {
    const caminho = escrever("dup.json", {
      conjunto,
      linhas: [...linhasUsuario, { ...linhasUsuario[0], aliquota: "9.0" }],
    });
    const antes = contagens();
    const e = erro(() => carregarArquivo(banco, caminho));
    expect(e?.codigo).toBe("ENTRADA_INVALIDA");
    expect(e?.message).toContain("linha 3");
    expect(contagens()).toEqual(antes);
  });

  it("nunca preenche validado_por/validado_em", () => {
    const r = carregarArquivo(banco, escrever("ok.json", { conjunto, linhas: [linhasUsuario[1], linhaOficial] }));
    const c = banco
      .prepare("SELECT validado_por, validado_em FROM conjunto_premissas WHERE id = ?")
      .get(r.conjuntoId);
    expect(c).toEqual({ validado_por: null, validado_em: null });
  });

  it("campos aceitos pelo carregador coincidem com dados/premissas/schema.json", () => {
    const schema = JSON.parse(
      readFileSync(new URL("../../../../dados/premissas/schema.json", import.meta.url), "utf8"),
    ) as {
      properties: { conjunto: { properties: object }; linhas: { items: { properties: object } } };
    };
    expect(Object.keys(schema.properties.linhas.items.properties).sort()).toEqual([...CAMPOS_LINHA].sort());
    expect(Object.keys(schema.properties.conjunto.properties).sort()).toEqual([...CAMPOS_CONJUNTO].sort());
  });
});
