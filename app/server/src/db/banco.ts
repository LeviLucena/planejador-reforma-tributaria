import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type Banco = Database.Database;

const PASTA_MIGRACOES = new URL("./migracoes/", import.meta.url);

function aplicarMigracoes(banco: Banco): void {
  banco.exec("CREATE TABLE IF NOT EXISTS migracoes (nome TEXT PRIMARY KEY, aplicada_em TEXT NOT NULL)");
  const aplicadas = new Set(
    (banco.prepare("SELECT nome FROM migracoes").all() as { nome: string }[]).map((l) => l.nome),
  );
  const arquivos = readdirSync(fileURLToPath(PASTA_MIGRACOES))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const registrar = banco.prepare("INSERT INTO migracoes (nome, aplicada_em) VALUES (?, ?)");
  for (const nome of arquivos) {
    if (aplicadas.has(nome)) continue;
    const sql = readFileSync(new URL(nome, PASTA_MIGRACOES), "utf8");
    banco.transaction(() => {
      banco.exec(sql);
      registrar.run(nome, new Date().toISOString());
    })();
  }
}

export function abrirBanco(caminho: string): Banco {
  const emMemoria = caminho === ":memory:";
  if (!emMemoria) mkdirSync(dirname(caminho), { recursive: true });
  const banco = new Database(caminho);
  banco.pragma("foreign_keys = ON");
  if (!emMemoria) banco.pragma("journal_mode = WAL");
  aplicarMigracoes(banco);
  return banco;
}
