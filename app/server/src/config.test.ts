import { describe, expect, it } from "vitest";
import { lerPorta, validarPortaApp } from "./config.js";

describe("lerPorta", () => {
  it("usa o padrão quando ausente", () => {
    expect(lerPorta(undefined)).toBe(3000);
  });
  it("aceita 1 a 65535", () => {
    expect(lerPorta("1")).toBe(1);
    expect(lerPorta("3999")).toBe(3999);
    expect(lerPorta("65535")).toBe(65535);
  });
  for (const ruim of ["", "0", "65536", "70000", "abc", "-1", "3.5", "3000x", " 80", "1e3", "0x50", "+80"]) {
    it(`rejeita "${ruim}" com mensagem em português`, () => {
      expect(() => lerPorta(ruim)).toThrowError(/PORTA_APP inválida/);
    });
  }
  it("validarPortaApp devolve mensagem limpa de uma linha ou null", () => {
    expect(validarPortaApp(undefined)).toBeNull();
    expect(validarPortaApp("3001")).toBeNull();
    for (const ruim of ["abc", "", "70000"]) {
      const m = validarPortaApp(ruim);
      expect(m).toMatch(/^PORTA_APP inválida: ".*"\. Informe um número inteiro de 1 a 65535\.$/);
      expect(m).not.toContain(String.fromCharCode(10));
    }
  });
});
