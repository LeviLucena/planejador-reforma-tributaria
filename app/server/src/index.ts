import { buildApp } from "./app.js";
import { config, validarPortaApp } from "./config.js";
import { abrirBanco } from "./db/banco.js";
import { criarMotores } from "./motores/regimeRegular.js";

const erroPorta = validarPortaApp(process.env.PORTA_APP);
if (erroPorta) {
  console.error(`ERRO: ${erroPorta}`);
  process.exit(1);
}

const motores = criarMotores(config);
const banco = abrirBanco(config.caminhoBanco);
const app = buildApp({ motores, banco, logger: true });
await app.listen({ port: config.portaApp, host: "127.0.0.1" });
console.log(`Servidor em http://127.0.0.1:${config.portaApp}`);
