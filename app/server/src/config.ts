import { fileURLToPath } from "node:url";

const bancoPadrao = fileURLToPath(new URL("../data/reforma.db", import.meta.url));

export const config = {
  portaApp: Number(process.env.PORTA_APP ?? 3000),
  urlRegimeRegular: process.env.URL_REGIME_REGULAR ?? "http://localhost:8080/api/calculadora",
  urlSimples: process.env.URL_SIMPLES ?? "http://localhost:8082/api",
  caminhoBanco: process.env.CAMINHO_BANCO ?? bancoPadrao,
};
