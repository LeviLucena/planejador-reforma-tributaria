import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { mensagemFalhaListen, origensExtrasDev } from "./inicializacao.js";

describe("mensagemFalhaListen", () => {
  it("porta ocupada (erro real do listen) vira mensagem de uma linha, sem stack", async () => {
    const ocupante = createServer();
    await new Promise<void>((ok) => ocupante.listen(0, "127.0.0.1", () => ok()));
    const porta = (ocupante.address() as { port: number }).port;
    const app = buildApp();
    let erro: unknown;
    try {
      await app.listen({ port: porta, host: "127.0.0.1" });
    } catch (e) {
      erro = e;
    } finally {
      await app.close();
      await new Promise<void>((ok) => ocupante.close(() => ok()));
    }
    const msg = mensagemFalhaListen(erro, porta);
    expect(msg).toBe(
      `a porta ${porta} já está em uso por outro programa. Feche-o (ou rode scripts/parar.bat) ou escolha outra porta em PORTA_APP.`,
    );
    expect(msg).not.toMatch(/\n/);
  });

  it("outros erros mantêm a mensagem original", () => {
    expect(mensagemFalhaListen(new Error("x"), 1)).toBe("não foi possível iniciar o servidor na porta 1: x");
    expect(mensagemFalhaListen(Object.assign(new Error("y"), { code: "EACCES" }), 80)).toMatch(/sem permissão/);
  });
});

describe("origensExtrasDev", () => {
  it("só libera a origem do Vite com MODO_DEV=1", () => {
    expect(origensExtrasDev(undefined)).toEqual([]);
    expect(origensExtrasDev("0")).toEqual([]);
    expect(origensExtrasDev("1")).toEqual(["http://127.0.0.1:5173", "http://localhost:5173"]);
  });
});
