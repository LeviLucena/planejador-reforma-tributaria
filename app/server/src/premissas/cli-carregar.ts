import { resolve } from "node:path";
import { config } from "../config.js";
import { abrirBanco } from "../db/banco.js";
import { carregarArquivo } from "./carregador.js";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npm -w app/server run premissas:carregar -- <arquivo.json>");
  process.exit(1);
}

const banco = abrirBanco(config.caminhoBanco);
try {
  // npm -w muda o cwd para app/server; INIT_CWD é a pasta onde o comando foi digitado.
  const r = carregarArquivo(banco, resolve(process.env.INIT_CWD ?? process.cwd(), arquivo));
  console.log(`Conjunto ${r.conjuntoId} criado com ${r.linhas} linha(s). Nenhuma linha validada: validado_por vazio.`);
} catch (e) {
  console.error(`Falha ao carregar: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  banco.close();
}
