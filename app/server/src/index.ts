import { buildApp } from "./app.js";
import { config } from "./config.js";
import { abrirBanco } from "./db/banco.js";
import { criarMotores } from "./motores/regimeRegular.js";

const motores = criarMotores(config);
const banco = abrirBanco(config.caminhoBanco);
const app = buildApp({ motores, banco, logger: true });
await app.listen({ port: config.portaApp, host: "127.0.0.1" });
console.log(`Servidor em http://127.0.0.1:${config.portaApp}`);
