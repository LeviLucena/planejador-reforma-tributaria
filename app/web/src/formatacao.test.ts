import { formatarDecimalBR, paraIsoComDeslocamento } from "./formatacao";

describe("formatarDecimalBR", () => {
  it.each([
    ["1465.00", "1.465,00"],
    ["56.76", "56,76"],
    ["0.64", "0,64"],
    ["0.00", "0,00"],
    ["-12.5", "-12,5"],
    ["-1234567.891", "-1.234.567,891"],
    ["1000000", "1.000.000"],
    ["999", "999"],
    ["1000", "1.000"],
    ["8.800000", "8,800000"],
    ["", ""],
    ["abc", "abc"],
    ["1.2.3", "1.2.3"],
    ["1e5", "1e5"],
    ["12,5", "12,5"],
  ])("%j -> %j", (entrada, saida) => {
    expect(formatarDecimalBR(entrada)).toBe(saida);
  });
});

describe("paraIsoComDeslocamento", () => {
  it.each([
    [180, "-03:00"],
    [0, "+00:00"],
    [-330, "+05:30"],
    [-60, "+01:00"],
  ])("deslocamento %i min", (oeste, sufixo) => {
    expect(paraIsoComDeslocamento("2027-03-10T10:00", oeste)).toBe(`2027-03-10T10:00:00${sufixo}`);
  });
  it("mantém segundos e rejeita formato inválido", () => {
    expect(paraIsoComDeslocamento("2027-03-10T10:00:30", 180)).toBe("2027-03-10T10:00:30-03:00");
    expect(paraIsoComDeslocamento("", 180)).toBeNull();
    expect(paraIsoComDeslocamento("10/03/2027", 180)).toBeNull();
  });
});
