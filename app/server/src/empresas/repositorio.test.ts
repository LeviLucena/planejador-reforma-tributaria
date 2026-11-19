import { beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio } from "../dominio/erros.js";
import {
  atualizarEmpresa,
  criarEmpresa,
  excluirEmpresa,
  listarEmpresas,
  obterEmpresa,
} from "./repositorio.js";

let banco: Banco;
beforeEach(() => {
  banco = abrirBanco(":memory:");
});

const base = {
  razaoSocial: "Padaria Exemplo Ltda",
  cnpj: "11.222.333/0001-81",
  regimeAtual: "presumido",
  uf: "RS",
  municipioIbge: "4314902",
};

function erroDe(fn: () => unknown): ErroDominio {
  try {
    fn();
  } catch (e) {
    return e as ErroDominio;
  }
  throw new Error("esperava erro");
}

describe("empresas", () => {
  it("cria com CNPJ formatado e guarda só os 14 dígitos", () => {
    const e = criarEmpresa(banco, base);
    expect(e.cnpj).toBe("11222333000181");
    expect(e.regimeAtual).toBe("presumido");
    expect(obterEmpresa(banco, e.id)).toEqual(e);
  });

  it("aceita CNPJ só com dígitos", () => {
    expect(criarEmpresa(banco, { ...base, cnpj: "11222333000181" }).cnpj).toBe("11222333000181");
  });

  for (const [nome, cnpj] of [
    ["dígito verificador errado", "11.222.333/0001-82"],
    ["tamanho errado", "1122233300018"],
    ["dígitos repetidos", "11111111111111"],
    ["zeros", "00000000000000"],
    ["letras", "11.222.333/0001-8x"],
    ["não texto", 11222333000181],
  ] as [string, unknown][]) {
    it(`rejeita CNPJ inválido: ${nome}`, () => {
      const e = erroDe(() => criarEmpresa(banco, { ...base, cnpj }));
      expect(e.codigo).toBe("ENTRADA_INVALIDA");
      expect(e.status).toBe(400);
      expect(e.message).toContain("cnpj");
    });
  }

  it("rejeita CNPJ duplicado (mesmo formatado de outro jeito)", () => {
    criarEmpresa(banco, base);
    const e = erroDe(() => criarEmpresa(banco, { ...base, cnpj: "11222333000181" }));
    expect(e.codigo).toBe("ENTRADA_INVALIDA");
    expect(e.status).toBe(400);
    expect(e.message).toContain("cnpj");
  });

  const invalidos: [string, Record<string, unknown>, string][] = [
    ["regime desconhecido", { regimeAtual: "mei" }, "regimeAtual"],
    ["uf minúscula", { uf: "rs" }, "uf"],
    ["uf inexistente", { uf: "XX" }, "uf"],
    ["município com 6 dígitos", { municipioIbge: "431490" }, "municipioIbge"],
    ["município com letras", { municipioIbge: "43149a2" }, "municipioIbge"],
    ["razão social vazia", { razaoSocial: "   " }, "razaoSocial"],
    ["razão social ausente", { razaoSocial: undefined }, "razaoSocial"],
  ];
  for (const [nome, mexida, campo] of invalidos) {
    it(`rejeita ${nome}`, () => {
      const e = erroDe(() => criarEmpresa(banco, { ...base, ...mexida }));
      expect(e.codigo).toBe("ENTRADA_INVALIDA");
      expect(e.message).toContain(campo);
    });
  }

  it("aceita os 3 regimes", () => {
    const cnpjs = ["11222333000181", "11444777000161", "45723174000110"];
    ["simples", "presumido", "real"].forEach((r, i) => {
      expect(criarEmpresa(banco, { ...base, cnpj: cnpjs[i], regimeAtual: r }).regimeAtual).toBe(r);
    });
  });

  it("lista, atualiza e exclui", () => {
    const a = criarEmpresa(banco, base);
    const b = criarEmpresa(banco, { ...base, cnpj: "11444777000161", razaoSocial: "Outra" });
    expect(listarEmpresas(banco).map((e) => e.id)).toEqual([a.id, b.id]);
    const novo = atualizarEmpresa(banco, a.id, { ...base, razaoSocial: "Renomeada", regimeAtual: "real" });
    expect(novo.razaoSocial).toBe("Renomeada");
    expect(novo.regimeAtual).toBe("real");
    excluirEmpresa(banco, a.id);
    expect(listarEmpresas(banco).map((e) => e.id)).toEqual([b.id]);
  });

  it("atualizar mantendo o próprio CNPJ é permitido; usar o de outra empresa não", () => {
    const a = criarEmpresa(banco, base);
    criarEmpresa(banco, { ...base, cnpj: "11444777000161" });
    expect(() => atualizarEmpresa(banco, a.id, base)).not.toThrow();
    const e = erroDe(() => atualizarEmpresa(banco, a.id, { ...base, cnpj: "11444777000161" }));
    expect(e.codigo).toBe("ENTRADA_INVALIDA");
  });

  it("inexistente → NAO_ENCONTRADO 404", () => {
    for (const fn of [
      () => obterEmpresa(banco, 99),
      () => atualizarEmpresa(banco, 99, base),
      () => excluirEmpresa(banco, 99),
    ]) {
      const e = erroDe(fn);
      expect(e.codigo).toBe("NAO_ENCONTRADO");
      expect(e.status).toBe(404);
    }
  });
});
