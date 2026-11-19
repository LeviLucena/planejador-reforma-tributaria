import { lerDecimal } from "./decimais";

// I7: tabela de entradas digitadas -> texto decimal enviado (ponto), ou erro.
describe("lerDecimal", () => {
  it.each([
    ["0.05", "0.05"],
    ["8.8", "8.8"],
    ["100.00", "100.00"],
    ["1200", "1200"],
    ["1,5", "1.5"],
    ["100,50", "100.50"],
    ["1.200,50", "1200.50"],
    ["1.234.567,89", "1234567.89"],
    ["  8,8 ", "8.8"],
    ["0", "0"],
  ])("aceita %j -> %j", (entrada, esperado) => {
    expect(lerDecimal(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it.each(["1.200", "12.345", "1.234.567", "999.999"])("recusa %j (ponto como milhar é ambíguo)", (entrada) => {
    expect(lerDecimal(entrada)).toEqual({
      ok: false,
      erro: `Use vírgula para decimais (ex.: 1200,00). "${entrada}" é ambíguo.`,
    });
  });

  it("a mensagem do caso típico é exatamente a combinada", () => {
    expect(lerDecimal("1.200")).toEqual({ ok: false, erro: 'Use vírgula para decimais (ex.: 1200,00). "1.200" é ambíguo.' });
  });

  it.each(["", "abc", "1,2,3", "1.2.3", "-5", "1.200,", ",5", "1 200", "1,200.50", "12.34,5"])("recusa %j como não numérico", (entrada) => {
    const r = lerDecimal(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).not.toMatch(/ambíguo/);
  });
});
