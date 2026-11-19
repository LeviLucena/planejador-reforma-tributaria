import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { criarMotores } from "./regimeRegular.js";

const motores = criarMotores(config);

describe("motor do Simples real", () => {
  it("lista as 15 atividades de 2027-03-10", async () => {
    const atividades = await motores.listarAtividades("2027-03-10");
    expect(atividades).toHaveLength(15);
    const a01 = atividades.find((a) => a.codigo === "01")!;
    expect(a01.anexoSemFatorR).toBe("I");
    expect(a01.descricao.startsWith("Revenda de mercadorias")).toBe(true);
    expect(a01.anexoComFatorR).toBeNull();
    expect(a01.sujeitaFatorR).toBe(false);
    expect(a01.disponivel).toBe(true);
    expect(Array.isArray(a01.tpDocsAdmissiveis)).toBe(true);
  });
});
