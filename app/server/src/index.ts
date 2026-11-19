import { buildApp } from "./app.js";
import { config, validarPortaApp } from "./config.js";
import { abrirBanco, type Banco } from "./db/banco.js";
import { criarMotores } from "./motores/regimeRegular.js";
import { mensagemFalhaListen, origensExtrasDev } from "./inicializacao.js";

const erroPorta = validarPortaApp(process.env.PORTA_APP);
if (erroPorta) {
  console.error(`ERRO: ${erroPorta}`);
  process.exit(1);
}

const porta = config.portaApp;
const motores = criarMotores(config);
let banco: Banco | undefined;
try {
  banco = abrirBanco(config.caminhoBanco);
} catch (e) {
  console.error(`ERRO: ${(e as Error).message}`);
  process.exit(1);
}
// Proteção contra outros sites (Host/Origin/Content-Type). Em desenvolvimento com o
// servidor do Vite (MODO_DEV=1), a origem dele (porta 5173) também é aceita.
const app = buildApp({
  motores,
  banco,
  logger: true,
  protecaoLocal: { porta, origensExtras: origensExtrasDev(process.env.MODO_DEV) },
});

let encerrando = false;
async function encerrar(sinal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  console.log(`Encerrando (${sinal})...`);
  try {
    await app.close();
  } catch {
    // segue para fechar o banco mesmo assim
  }
  if (banco?.open) banco.close();
  process.exit(0);
}
process.on("SIGINT", () => void encerrar("SIGINT"));
process.on("SIGTERM", () => void encerrar("SIGTERM"));

try {
  await app.listen({ port: porta, host: "127.0.0.1" });
} catch (e) {
  console.error(`ERRO: ${mensagemFalhaListen(e, porta)}`);
  try {
    await app.close();
  } catch {
    // nada a fazer
  }
  if (banco?.open) banco.close();
  process.exit(1);
}
console.log(`Servidor em http://127.0.0.1:${porta}`);
