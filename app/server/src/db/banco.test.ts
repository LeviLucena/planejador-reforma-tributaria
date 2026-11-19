import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarTemporario } from "../test-utils/tmp.js";
import { abrirBanco, type Banco } from "./banco.js";

let banco: Banco;
beforeEach(() => {
  banco = abrirBanco(":memory:");
  banco.prepare("INSERT INTO conjunto_premissas (id, nome, vigencia_inicio) VALUES (1, 'c', '2027-01-01')").run();
});
afterEach(() => banco.close());

const SQL_PREMISSA = `INSERT INTO premissa_aliquota
  (conjunto_id, tributo, aliquota, origem, fonte_norma, fonte_artigo, consultado_em)
  VALUES (1, @tributo, '0.088', @origem, @fonte_norma, @fonte_artigo, @consultado_em)`;

function premissa(extra: Record<string, unknown> = {}) {
  return {
    tributo: "CBS",
    origem: "oficial",
    fonte_norma: "LC 214/2025",
    fonte_artigo: "art. 18",
    consultado_em: "2026-11-18T00:00:00Z",
    ...extra,
  };
}
const inserir = (extra: Record<string, unknown> = {}) => banco.prepare(SQL_PREMISSA).run(premissa(extra));

describe("regra de fonte obrigatória", () => {
  it("oficial sem fonte_norma falha (null, vazia), sem artigo e sem consultado_em", () => {
    expect(() => inserir({ fonte_norma: null })).toThrow(/CHECK constraint/);
    expect(() => inserir({ fonte_norma: "" })).toThrow(/CHECK constraint/);
    expect(() => inserir({ fonte_artigo: null })).toThrow(/CHECK constraint/);
    expect(() => inserir({ consultado_em: null })).toThrow(/CHECK constraint/);
  });

  it("fonte completa insere; lei_transicao sem fonte falha", () => {
    expect(inserir().changes).toBe(1);
    expect(inserir({ tributo: "IBS_UF", origem: "lei_transicao" }).changes).toBe(1);
    expect(() => inserir({ origem: "lei_transicao", fonte_norma: null })).toThrow(/CHECK constraint/);
  });

  it("usuario sem fonte insere", () => {
    const r = inserir({ origem: "usuario", fonte_norma: null, fonte_artigo: null, consultado_em: null });
    expect(r.changes).toBe(1);
  });

  it("tributo ou origem inválidos falham", () => {
    expect(() => inserir({ tributo: "ICMS" })).toThrow(/CHECK constraint/);
    expect(() => inserir({ origem: "chute" })).toThrow(/CHECK constraint/);
  });
});

describe("cenario e empresa", () => {
  const empresa = () =>
    banco
      .prepare("INSERT INTO empresa (razao_social, cnpj, regime_atual, uf, municipio_ibge) VALUES ('X','1','lucro_presumido','SP','3550308')")
      .run().lastInsertRowid;
  const cenario = (empresaId: number | bigint, versao: number) =>
    banco
      .prepare(
        `INSERT INTO cenario (empresa_id, nome, versao_numero, entrada_json, resultado_json, versao_motor, conjunto_premissas_id)
         VALUES (?, 'base', ?, '{}', '{}', 'v1', 1)`,
      )
      .run(empresaId, versao);

  it("excluir empresa remove seus cenarios em cascata", () => {
    const e = empresa();
    cenario(e, 1);
    banco.prepare("DELETE FROM empresa WHERE id = ?").run(e);
    expect(banco.prepare("SELECT COUNT(*) AS n FROM cenario").get()).toEqual({ n: 0 });
  });

  it("excluir conjunto referenciado por cenario falha", () => {
    cenario(empresa(), 1);
    expect(() => banco.prepare("DELETE FROM conjunto_premissas WHERE id = 1").run()).toThrow(/FOREIGN KEY/);
  });

  it("(empresa_id, nome, versao_numero) duplicado falha", () => {
    const e = empresa();
    cenario(e, 1);
    expect(() => cenario(e, 1)).toThrow(/UNIQUE/);
    expect(cenario(e, 2).changes).toBe(1);
  });
});

describe("migrações", () => {
  let tmp: ReturnType<typeof criarTemporario>;
  let pasta: string;
  beforeEach(() => {
    tmp = criarTemporario("reforma-banco-");
    pasta = tmp.dir;
  });
  afterEach(() => tmp.limpar());

  it("abrir o mesmo arquivo duas vezes não reaplica; cria diretório pai", () => {
    const arquivo = join(pasta, "sub", "teste.db");
    tmp.rastrear(abrirBanco(arquivo)).close();
    const de_novo = tmp.rastrear(abrirBanco(arquivo));
    const n = de_novo.prepare("SELECT COUNT(*) AS n FROM migracoes").get();
    de_novo.close();
    expect(n).toEqual({ n: 4 });
  });

  it("banco que já tinha 001+002 recebe só a 003 e preserva os dados", () => {
    const arquivo = join(pasta, "antigo.db");
    mkdirSync(pasta, { recursive: true });
    const antigo = tmp.rastrear(new Database(arquivo));
    antigo.exec("CREATE TABLE migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)");
    for (const nome of ["001_inicial.sql", "002_unicidade_premissa.sql"]) {
      antigo.exec(readFileSync(new URL(`./migracoes/${nome}`, import.meta.url), "utf8"));
      antigo.prepare("INSERT INTO migracoes (nome, aplicada_em) VALUES (?, '2026-11-01T00:00:00Z')").run(nome);
    }
    antigo.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('velho', '2027-01-01')").run();
    antigo.close();

    const b = tmp.rastrear(abrirBanco(arquivo));
    const migracoes = b.prepare("SELECT nome, aplicada_em FROM migracoes ORDER BY nome").all() as {
      nome: string;
      aplicada_em: string;
    }[];
    const conjunto = b.prepare("SELECT nome, vigencia_fim FROM conjunto_premissas").get();
    b.close();
    expect(migracoes.map((m) => m.nome)).toEqual([
      "001_inicial.sql",
      "002_unicidade_premissa.sql",
      "003_vigencia_fim.sql",
      "004_empresa_cnpj_unico.sql",
    ]);
    expect(migracoes.slice(0, 2).every((m) => m.aplicada_em === "2026-11-01T00:00:00Z")).toBe(true);
    expect(conjunto).toEqual({ nome: "velho", vigencia_fim: null });
  });
});
