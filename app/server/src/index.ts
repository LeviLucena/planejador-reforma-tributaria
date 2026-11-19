import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = buildApp({ logger: true });
await app.listen({ port: config.portaApp, host: "127.0.0.1" });
console.log(`Servidor em http://127.0.0.1:${config.portaApp}`);
