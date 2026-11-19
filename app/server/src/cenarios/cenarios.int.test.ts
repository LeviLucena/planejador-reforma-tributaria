import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { abrirBanco } from "../db/banco.js";
import type { OperacaoEntrada } from "../dominio/tipos.js";
import { criarMotores } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "../premissas/repositorio.js";

const oficial = JSON.parse(
  readFileSync(new URL("../../test/fixtures/operacao-oficial.json", import.meta.url), "utf8"),
) as OperacaoEntrada;
const pasta = mkdtempSync(join(tmpdir(), "reforma-int-"));
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

describe("empresa + cenário ponta a ponta com o motor real e banco em arquivo", () => {
  it("salva, reabre e recalcula com os totais oficiais", async () => {
    const banco = abrirBanco(join(pasta, "teste.db"));
    const app = buildApp({ motores: criarMotores(config), banco });

    const c = criarConjunto(banco, { nome: "usuário", vigenciaInicio: "2027-01-01" });
    adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
    adicionarPremissa(banco, c, {
      tributo: "IBS_MUN",
      aliquota: "0.05",
      uf: "RS",
      municipioIbge: 4314902,
      origem: "usuario",
    });
    adicionarPremissa(banco, c, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });

    const emp = await app.inject({
      method: "POST",
      url: "/api/empresas",
      payload: {
        razaoSocial: "Padaria Exemplo Ltda",
        cnpj: "11.222.333/0001-81",
        regimeAtual: "presumido",
        uf: "RS",
        municipioIbge: "4314902",
      },
    });
    expect(emp.statusCode).toBe(201);

    const op = structuredClone(oficial);
    for (const item of op.itens) delete item.aliquotasNominais;
    const salvo = await app.inject({
      method: "POST",
      url: `/api/empresas/${emp.json().id}/cenarios`,
      payload: { nome: "Base 2027", operacao: op, conjuntoPremissasId: c },
    });
    expect(salvo.statusCode).toBe(201);
    expect(salvo.json().versaoMotor).toMatch(/^regular=\S+\+V\d+; simples=\S+\/V\d+$/);

    const aberto = await app.inject({ method: "GET", url: `/api/cenarios/${salvo.json().id}` });
    expect(aberto.statusCode).toBe(200);
    const { resultado } = aberto.json();
    const t = resultado.total.tribCalc;
    expect(t.IBSCBSTot.gCBS.vCBS).toBe("56.76");
    expect(t.IBSCBSTot.gIBS.vIBS).toBe("0.64");
    expect(t.ISTot.vIS).toBe("15.00");
    expect(resultado.objetos[3].estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(resultado.objetos[3].erros.map((e: { code: string }) => e.code)).toContain("REG-011");
    expect(aberto.json()).toEqual(salvo.json());

    const v2 = await app.inject({ method: "POST", url: `/api/cenarios/${salvo.json().id}/recalcular` });
    expect(v2.statusCode).toBe(201);
    expect(v2.json().versaoNumero).toBe(2);
    expect(v2.json().resultado).toEqual(resultado);
    banco.close();
  });
});
