import { describe, expect, it } from "vitest";
import { lerPorta } from "./config.js";

describe("lerPorta", () => {
  it("usa o padrão quando ausente", () => {
    expect(lerPorta(undefined)).toBe(3000);
    expect(lerPorta("")).toBe(3000);
  });
  it("aceita 1 a 65535", () => {
    expect(lerPorta("1")).toBe(1);
    expect(lerPorta("3999")).toBe(3999);
    expect(lerPorta("65535")).toBe(65535);
  });
  for (const ruim of ["0", "65536", "abc", "-1", "3.5", "3000x", " 80", "1e3"]) {
    it(`rejeita "${ruim}" com mensagem em português`, () => {
      expect(() => lerPorta(ruim)).toThrowError(/PORTA_APP inválida/);
    });
  }
});
