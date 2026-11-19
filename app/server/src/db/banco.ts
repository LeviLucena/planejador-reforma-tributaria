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

/**
 * Journal DELETE (não WAL): cada transação confirmada fica inteira no arquivo
 * principal, então copiar só o reforma.db é um backup completo mesmo se o
 * servidor for encerrado à força. Definir explicitamente também converte um
 * arquivo criado por uma versão anterior em WAL (o SQLite faz o checkpoint).
 */
function definirJournalDelete(banco: Banco, caminho: string): void {
  let modo: unknown;
  try {
    modo = banco.pragma("journal_mode = DELETE", { simple: true });
  } catch (e) {
    modo = (e as Error).message;
  }
  if (typeof modo !== "string" || modo.toLowerCase() !== "delete") {
    banco.close();
    throw new Error(
      `Não foi possível converter o banco para gravação direta (journal DELETE): ${caminho}. ` +
        `Modo atual: ${String(modo)}. Outro programa pode estar com o banco aberto; ` +
        "feche-o (ou pare o app com scripts/parar.bat) e tente de novo.",
    );
  }
}

export function abrirBanco(caminho: string): Banco {
  const emMemoria = caminho === ":memory:";
  if (!emMemoria) mkdirSync(dirname(caminho), { recursive: true });
  const banco = new Database(caminho);
  banco.pragma("foreign_keys = ON");
  if (!emMemoria) definirJournalDelete(banco, caminho);
  aplicarMigracoes(banco);
  return banco;
}
