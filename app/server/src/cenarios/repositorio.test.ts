import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio, MOTOR_INDISPONIVEL } from "../dominio/erros.js";
import type { OperacaoEntrada, ResultadoOperacao } from "../dominio/tipos.js";
import { criarEmpresa, excluirEmpresa } from "../empresas/repositorio.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto, validarConjunto } from "../premissas/repositorio.js";
import { listarCenarios, reabrirCenario, recalcularCenario, salvarCenario } from "./repositorio.js";

const ler = (n: string) => readFileSync(new URL(`../../test/fixtures/${n}`, import.meta.url), "utf8");
const oficial = JSON.parse(ler("operacao-oficial.json")) as OperacaoEntrada;
const respostaOficial = JSON.parse(ler("resposta-oficial.json")) as ResultadoOperacao;

let banco: Banco;
let falha: Error | undefined;
let chamadas: number;

// Isola só a rede: o resultado devolvido é a resposta real oficial gravada em fixture.
const motores = {
  async calcularOperacao() {
    chamadas++;
    if (falha) throw falha;
    return structuredClone(respostaOficial);
  },
  async versoes() {
    return { regimeRegular: "1.6.1+V0059", simples: { app: "0.0.6", db: "V0059" } };
  },
} as unknown as MotoresPort;

let empresaId: number;
let conjuntoId: number;

function operacaoSemAliquotas(): OperacaoEntrada {
  const op = structuredClone(oficial);
  for (const item of op.itens) delete item.aliquotasNominais;
  return op;
}

const recusa = (p: Promise<unknown>) => p.then(() => undefined, (x) => x as ErroDominio);

beforeEach(() => {
  banco = abrirBanco(":memory:");
  falha = undefined;
  chamadas = 0;
  empresaId = criarEmpresa(banco, {
    razaoSocial: "Empresa Teste",
    cnpj: "11222333000181",
    regimeAtual: "presumido",
    uf: "RS",
    municipioIbge: "4314902",
  }).id;
  conjuntoId = criarConjunto(banco, { nome: "usuário", vigenciaInicio: "2027-01-01" });
  adicionarPremissa(banco, conjuntoId, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
  adicionarPremissa(banco, conjuntoId, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
  adicionarPremissa(banco, conjuntoId, {
    tributo: "IBS_MUN",
    aliquota: "0.05",
    uf: "RS",
    municipioIbge: 4314902,
    origem: "usuario",
  });
  adicionarPremissa(banco, conjuntoId, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });
});

const contar = () => (banco.prepare("SELECT COUNT(*) AS n FROM cenario").get() as { n: number }).n;

describe("salvarCenario / reabrirCenario", () => {
  it("grava versão 1 e o resultado reaberto é idêntico (REG-011 e acentos)", async () => {
    const op = operacaoSemAliquotas();
    const c = await salvarCenario(
      { motores, banco },
      { empresaId, nome: "Base 2027", operacao: op, conjuntoPremissasId: conjuntoId },
    );
    expect(c.versaoNumero).toBe(1);
    expect(c.versaoMotor).toBe("regular=1.6.1+V0059; simples=0.0.6/V0059");
    expect(c.conjuntoPremissasId).toBe(conjuntoId);

    const r = reabrirCenario(banco, c.id);
    expect(r.resultado).toEqual(respostaOficial);
    expect(r.resultado.objetos[3]!.erros!.map((e) => e.code)).toContain("REG-011");
    expect(JSON.stringify(r.resultado)).toContain("Operação de consumo com enquadramento legal");
    expect(r.entrada).toEqual(op); // como o chamador enviou
    expect(r.entrada.itens[0]!.aliquotasNominais).toBeUndefined();
    expect(r.entradaEnviada.itens[0]!.aliquotasNominais).toMatchObject({
      cbs: "8.8",
      ibsEstadual: "0.05",
      ibsMunicipal: "0.05",
    });
    expect(r.origensPremissas.CBS).toBe("usuario");
    expect(r).toEqual(c);
  });

  it("reabrir lê só o banco: funciona com motores que explodem se tocados", async () => {
    const c = await salvarCenario(
      { motores, banco },
      { empresaId, nome: "X", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
    );
    expect(chamadas).toBe(1);
    // reabrirCenario nem recebe motores; o banco é a única dependência.
    expect(reabrirCenario(banco, c.id).resultado).toEqual(respostaOficial);
    expect(chamadas).toBe(1);
  });

  it("nome duplicado na mesma empresa é rejeitado; em outra empresa é permitido", async () => {
    const dep = { motores, banco };
    const req = { empresaId, nome: "Dup", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId };
    await salvarCenario(dep, req);
    const e = await recusa(salvarCenario(dep, req));
    expect(e!.codigo).toBe("ENTRADA_INVALIDA");
    expect(e!.status).toBe(400);
    expect(e!.message).toContain("recalcular");
    expect(contar()).toBe(1);
    const outra = criarEmpresa(banco, {
      razaoSocial: "Outra",
      cnpj: "11444777000161",
      regimeAtual: "real",
      uf: "RS",
      municipioIbge: "4314902",
    });
    await salvarCenario(dep, { ...req, empresaId: outra.id });
    expect(contar()).toBe(2);
  });

  it("simulação que falha não grava nada", async () => {
    const dep = { motores, banco };
    falha = new ErroDominio(MOTOR_INDISPONIVEL, "fora do ar", 503);
    const e1 = await recusa(
      salvarCenario(dep, { empresaId, nome: "A", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId }),
    );
    expect(e1!.codigo).toBe("MOTOR_INDISPONIVEL");
    falha = undefined;
    const vazio = criarConjunto(banco, { nome: "vazio", vigenciaInicio: "2027-01-01" });
    const e2 = await recusa(
      salvarCenario(dep, { empresaId, nome: "B", operacao: operacaoSemAliquotas(), conjuntoPremissasId: vazio }),
    );
    expect(e2!.codigo).toBe("PREMISSA_AUSENTE");
    expect(contar()).toBe(0);
  });

  it("empresa ou conjunto inexistente → erro de domínio, sem gravar", async () => {
    const dep = { motores, banco };
    const e1 = await recusa(
      salvarCenario(dep, { empresaId: 99, nome: "A", operacao: oficial, conjuntoPremissasId: conjuntoId }),
    );
    expect(e1!.codigo).toBe("NAO_ENCONTRADO");
    const e2 = await recusa(
      salvarCenario(dep, { empresaId, nome: "A", operacao: oficial, conjuntoPremissasId: 999 }),
    );
    expect(e2!.codigo).toBe("PREMISSA_AUSENTE");
    expect(contar()).toBe(0);
  });

  it("nome vazio é rejeitado", async () => {
    const e = await recusa(
      salvarCenario({ motores, banco }, { empresaId, nome: "  ", operacao: oficial, conjuntoPremissasId: conjuntoId }),
    );
    expect(e!.codigo).toBe("ENTRADA_INVALIDA");
    expect(e!.message).toContain("nome");
  });

  it("reabrir id inexistente → NAO_ENCONTRADO", () => {
    expect(() => reabrirCenario(banco, 1234)).toThrowError(/não encontrado/);
  });
});

describe("recalcularCenario", () => {
  it("cria a versão 2 e deixa a versão 1 byte a byte igual", async () => {
    const dep = { motores, banco };
    const v1 = await salvarCenario(dep, {
      empresaId,
      nome: "Base",
      operacao: operacaoSemAliquotas(),
      conjuntoPremissasId: conjuntoId,
    });
    const antes = banco.prepare("SELECT * FROM cenario WHERE id = ?").get(v1.id);
    const v2 = await recalcularCenario(dep, v1.id);
    expect(v2.versaoNumero).toBe(2);
    expect(v2.id).not.toBe(v1.id);
    expect(v2.nome).toBe("Base");
    expect(v2.conjuntoPremissasId).toBe(conjuntoId);
    expect(v2.entrada).toEqual(v1.entrada);
    expect(banco.prepare("SELECT * FROM cenario WHERE id = ?").get(v1.id)).toEqual(antes);
    expect((await recalcularCenario(dep, v1.id)).versaoNumero).toBe(3);
    expect(listarCenarios(banco, empresaId).map((c) => [c.nome, c.versaoNumero])).toEqual([
      ["Base", 1],
      ["Base", 2],
      ["Base", 3],
    ]);
  });

  it("se a nova simulação falha, nada é inserido", async () => {
    const dep = { motores, banco };
    const v1 = await salvarCenario(dep, {
      empresaId,
      nome: "Base",
      operacao: operacaoSemAliquotas(),
      conjuntoPremissasId: conjuntoId,
    });
    falha = new ErroDominio(MOTOR_INDISPONIVEL, "fora do ar", 503);
    const e = await recusa(recalcularCenario(dep, v1.id));
    expect(e!.codigo).toBe("MOTOR_INDISPONIVEL");
    expect(contar()).toBe(1);
  });

  it("id inexistente → NAO_ENCONTRADO", async () => {
    const e = await recusa(recalcularCenario({ motores, banco }, 77));
    expect(e!.codigo).toBe("NAO_ENCONTRADO");
  });
});

describe("listar e excluir", () => {
  it("listarCenarios traz todas as versões ordenadas por nome e versão", async () => {
    const dep = { motores, banco };
    const op = operacaoSemAliquotas();
    const b = await salvarCenario(dep, { empresaId, nome: "B", operacao: op, conjuntoPremissasId: conjuntoId });
    await salvarCenario(dep, { empresaId, nome: "A", operacao: op, conjuntoPremissasId: conjuntoId });
    await recalcularCenario(dep, b.id);
    expect(listarCenarios(banco, empresaId).map((c) => `${c.nome}${c.versaoNumero}`)).toEqual(["A1", "B1", "B2"]);
  });

  it("excluir a empresa apaga seus cenários", async () => {
    await salvarCenario(
      { motores, banco },
      { empresaId, nome: "A", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
    );
    expect(contar()).toBe(1);
    excluirEmpresa(banco, empresaId);
    expect(contar()).toBe(0);
  });
});

describe("versão do motor ao salvar (I1)", () => {
  // Fakes só para isolar a rede; o resultado é a resposta oficial gravada.
  const comVersoes = (versoes: () => Promise<unknown>) =>
    ({ ...motores, calcularOperacao: motores.calcularOperacao, versoes } as unknown as MotoresPort);

  it("motor do Simples fora do ar não impede salvar: grava simples=indisponivel", async () => {
    const m = comVersoes(async () => ({ regimeRegular: "1.6.1+V0059", simples: null }));
    const c = await salvarCenario(
      { motores: m, banco },
      { empresaId, nome: "Sem Simples", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
    );
    expect(c.versaoMotor).toBe("regular=1.6.1+V0059; simples=indisponivel");
    const v2 = await recalcularCenario({ motores: m, banco }, c.id);
    expect(v2.versaoMotor).toBe("regular=1.6.1+V0059; simples=indisponivel");
  });

  it("motor do regime regular fora do ar continua impedindo salvar (nada gravado)", async () => {
    const m = comVersoes(async () => {
      throw new ErroDominio(MOTOR_INDISPONIVEL, "regular fora", 503);
    });
    const e = await recusa(
      salvarCenario(
        { motores: m, banco },
        { empresaId, nome: "X", operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
      ),
    );
    expect(e!.codigo).toBe(MOTOR_INDISPONIVEL);
    expect(contar()).toBe(0);
  });
});

describe("snapshot das premissas no cenário (I5)", () => {
  const salvarBase = (nome = "Base") =>
    salvarCenario(
      { motores, banco },
      { empresaId, nome, operacao: operacaoSemAliquotas(), conjuntoPremissasId: conjuntoId },
    );

  it("grava conjunto e todas as linhas do momento; validar depois não muda o snapshot", async () => {
    const c = await salvarBase();
    expect(c.premissasSnapshot).not.toBeNull();
    const s = c.premissasSnapshot!;
    expect(s.conjunto).toEqual({
      id: conjuntoId,
      nome: "usuário",
      vigenciaInicio: "2027-01-01",
      vigenciaFim: null,
      validadoPor: null,
      validadoEm: null,
    });
    expect(s.linhas.map((l) => [l.tributo, l.uf, l.municipioIbge, l.aliquota, l.origem])).toEqual([
      ["CBS", null, null, "8.8", "usuario"],
      ["IBS_UF", "RS", null, "0.05", "usuario"],
      ["IBS_MUN", "RS", "4314902", "0.05", "usuario"],
      ["IS_ADVALOREM", null, null, "10.0", "usuario"],
    ]);
    expect(Object.keys(s.linhas[0]!).sort()).toEqual(
      ["aliquota", "consultadoEm", "fonteArtigo", "fonteNorma", "id", "municipioIbge", "origem", "tributo", "uf"].sort(),
    );

    validarConjunto(banco, conjuntoId, "Ana");
    const reaberto = reabrirCenario(banco, c.id);
    expect(reaberto.premissasSnapshot!.conjunto.validadoPor).toBeNull();
    expect(reaberto.premissasSnapshot).toEqual(s);
  });

  it("linhas acrescentadas ao conjunto depois não entram no snapshot; a v2 tem o próprio snapshot", async () => {
    const c = await salvarBase();
    adicionarPremissa(banco, conjuntoId, { tributo: "IS_ADREM", aliquota: "1.5", origem: "usuario" });
    expect(reabrirCenario(banco, c.id).premissasSnapshot!.linhas.map((l) => l.tributo)).not.toContain("IS_ADREM");
    validarConjunto(banco, conjuntoId, "Bia");
    const v2 = await recalcularCenario({ motores, banco }, c.id);
    expect(v2.premissasSnapshot!.linhas.map((l) => l.tributo)).toContain("IS_ADREM");
    expect(v2.premissasSnapshot!.conjunto.validadoPor).toBe("Bia");
    expect(reabrirCenario(banco, c.id).premissasSnapshot!.conjunto.validadoPor).toBeNull();
  });

  it("cenário antigo (entrada_json sem snapshot) reabre com premissasSnapshot null", async () => {
    const c = await salvarBase();
    const e = JSON.parse(
      (banco.prepare("SELECT entrada_json FROM cenario WHERE id = ?").get(c.id) as { entrada_json: string }).entrada_json,
    );
    delete e.premissasSnapshot;
    banco.prepare("UPDATE cenario SET entrada_json = ? WHERE id = ?").run(JSON.stringify(e), c.id);
    const r = reabrirCenario(banco, c.id);
    expect(r.premissasSnapshot).toBeNull();
    expect(r.resultado).toEqual(respostaOficial);
  });
});
