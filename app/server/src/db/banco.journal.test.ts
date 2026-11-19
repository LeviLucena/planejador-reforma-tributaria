import Database from "better-sqlite3";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarTemporario } from "../test-utils/tmp.js";
import { abrirBanco } from "./banco.js";

// C1: o backup do guia copia só reforma.db. Com WAL, os dados ficavam no -wal
// enquanto o servidor era morto à força (sem checkpoint). Journal DELETE grava
// tudo no arquivo principal a cada transação.
describe("journal do banco em arquivo (backup copiando só o .db)", () => {
  let tmp: ReturnType<typeof criarTemporario>;
  beforeEach(() => {
    tmp = criarTemporario("reforma-journal-");
  });
  afterEach(() => tmp.limpar());

  it("copiar só o arquivo principal com a conexão ABERTA preserva tabelas e linhas", () => {
    const arquivo = join(tmp.dir, "reforma.db");
    const banco = tmp.rastrear(abrirBanco(arquivo));
    banco.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('c1', '2027-01-01')").run();
    banco.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('c2', '2027-01-01')").run();
    // sem fechar a conexão (como no encerramento forçado pelo taskkill /F)
    const copia = join(tmp.dir, "copia.db");
    copyFileSync(arquivo, copia);
    const lida = tmp.rastrear(new Database(copia, { readonly: true }));
    const nomes = (lida.prepare("SELECT nome FROM conjunto_premissas ORDER BY nome").all() as { nome: string }[]).map(
      (l) => l.nome,
    );
    const migracoes = lida.prepare("SELECT COUNT(*) AS n FROM migracoes").get();
    expect(nomes).toEqual(["c1", "c2"]);
    expect(migracoes).toEqual({ n: 4 });
    expect(banco.pragma("journal_mode", { simple: true })).toBe("delete");
  });

  it("arquivo criado antes em WAL é convertido para DELETE com os dados intactos", () => {
    const arquivo = join(tmp.dir, "antigo-wal.db");
    const antigo = tmp.rastrear(abrirBanco(arquivo));
    antigo.pragma("journal_mode = WAL");
    expect(antigo.pragma("journal_mode", { simple: true })).toBe("wal");
    antigo.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('em-wal', '2027-01-01')").run();
    antigo.close();

    const b = tmp.rastrear(abrirBanco(arquivo));
    expect(b.pragma("journal_mode", { simple: true })).toBe("delete");
    expect(b.prepare("SELECT nome FROM conjunto_premissas").all()).toEqual([{ nome: "em-wal" }]);
    expect(existsSync(`${arquivo}-wal`)).toBe(false);
    expect(existsSync(`${arquivo}-shm`)).toBe(false);
  });

  it("nenhum -wal/-shm fica ao lado do banco após gravações", () => {
    const arquivo = join(tmp.dir, "sem-wal.db");
    const banco = tmp.rastrear(abrirBanco(arquivo));
    banco.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('x', '2027-01-01')").run();
    expect(existsSync(`${arquivo}-wal`)).toBe(false);
    expect(existsSync(`${arquivo}-shm`)).toBe(false);
    banco.close();
    expect(existsSync(`${arquivo}-wal`)).toBe(false);
    expect(existsSync(`${arquivo}-shm`)).toBe(false);
  });

  it("arquivo em WAL preso por outra conexão: erro claro em português", () => {
    const arquivo = join(tmp.dir, "preso.db");
    const primeira = tmp.rastrear(abrirBanco(arquivo));
    primeira.pragma("journal_mode = WAL");
    primeira.prepare("INSERT INTO conjunto_premissas (nome, vigencia_inicio) VALUES ('p', '2027-01-01')").run();
    // a primeira conexão continua aberta, segurando o WAL
    expect(() => tmp.rastrear(abrirBanco(arquivo))).toThrow(/Não foi possível converter o banco/);
  });
});
