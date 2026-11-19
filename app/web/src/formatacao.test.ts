import { formatarDecimalBR, paraIsoBrasilia } from "./formatacao";

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
    ["0001.50", "1,50"],
    ["0.50", "0,50"],
    ["000", "0"],
    ["-007.5", "-7,5"],
    ["00012345", "12.345"],
  ])("%j -> %j", (entrada, saida) => {
    expect(formatarDecimalBR(entrada)).toBe(saida);
  });
});

describe("paraIsoBrasilia", () => {
  const fusoOriginal = process.env.TZ;
  afterEach(() => {
    if (fusoOriginal === undefined) delete process.env.TZ;
    else process.env.TZ = fusoOriginal;
  });

  it.each(["UTC", "America/Sao_Paulo", "Asia/Kolkata", "Pacific/Auckland"])(
    "sempre -03:00, mesmo com o fuso do processo em %s",
    (fuso) => {
      process.env.TZ = fuso;
      expect(paraIsoBrasilia("2027-03-10T10:00")).toBe("2027-03-10T10:00:00-03:00");
    },
  );
  it("mantém segundos e rejeita formato inválido", () => {
    expect(paraIsoBrasilia("2027-03-10T10:00:30")).toBe("2027-03-10T10:00:30-03:00");
    expect(paraIsoBrasilia("")).toBeNull();
    expect(paraIsoBrasilia("10/03/2027")).toBeNull();
  });
});
