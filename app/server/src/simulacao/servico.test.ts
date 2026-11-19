import { beforeEach, describe, expect, it } from "vitest";
import { abrirBanco, type Banco } from "../db/banco.js";
import { ErroDominio, MOTOR_INDISPONIVEL, PREMISSA_AUSENTE } from "../dominio/erros.js";
import type { OperacaoEntrada, ResultadoOperacao } from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { adicionarPremissa, criarConjunto } from "../premissas/repositorio.js";
import { simularOperacao } from "./servico.js";

// Fake somente para isolar a rede: registra o que recebeu.
function motorFake(falha?: Error) {
  const recebidas: OperacaoEntrada[] = [];
  const resultado: ResultadoOperacao = { objetos: [], total: {} };
  const motores = {
    async calcularOperacao(op: OperacaoEntrada) {
      recebidas.push(op);
      if (falha) throw falha;
      return resultado;
    },
  } as unknown as MotoresPort;
  return { motores, recebidas, resultado };
}

function operacao(): OperacaoEntrada {
  return {
    id: "op1",
    versao: "1.0.0",
    dhFatoGerador: "2027-03-10T10:00:00-03:00",
    municipio: 4314902,
    uf: "RS",
    itens: [
      { numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: "100" },
      {
        numero: 2,
        ncm: "22030000",
        cst: "000",
        cClassTrib: "000001",
        impostoSeletivo: { cst: "000", cClassTrib: "000001", baseCalculo: "150" },
      },
      {
        numero: 3,
        nbs: "122011200",
        cst: "200",
        cClassTrib: "200028",
        baseCalculo: "1200",
        aliquotasNominais: { cbs: "1.0", ibsEstadual: "2.0", ibsMunicipal: "3.0" },
      },
    ],
  };
}

let banco: Banco;
let c: number;

beforeEach(() => {
  banco = abrirBanco(":memory:");
  c = criarConjunto(banco, { nome: "t", vigenciaInicio: "2027-01-01" });
});

function completo(comIS = true) {
  adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
  adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
  adicionarPremissa(banco, c, {
    tributo: "IBS_MUN",
    aliquota: "0.05",
    uf: "RS",
    municipioIbge: 4314902,
    origem: "usuario",
  });
  if (comIS) adicionarPremissa(banco, c, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });
}

describe("simularOperacao", () => {
  it("(a) item sem alíquota recebe a do conjunto; o item com alíquota própria mantém a dele", async () => {
    completo();
    const f = motorFake();
    const op = operacao();
    const antes = JSON.stringify(op);
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: c });
    expect(f.recebidas).toHaveLength(1);
    expect(r.entradaEnviada).toBe(f.recebidas[0]);
    expect(r.resultado).toBe(f.resultado);
    const [i1, i2, i3] = r.entradaEnviada.itens;
    expect(i1!.aliquotasNominais).toEqual({ cbs: "8.8", ibsEstadual: "0.05", ibsMunicipal: "0.05" });
    expect(i2!.aliquotasNominais).toEqual({
      cbs: "8.8",
      ibsEstadual: "0.05",
      ibsMunicipal: "0.05",
      impostoSeletivo: { adValorem: "10.0" },
    });
    expect(i3!.aliquotasNominais).toEqual({ cbs: "1.0", ibsEstadual: "2.0", ibsMunicipal: "3.0" });
    expect(r.origensPremissas).toEqual({
      CBS: "usuario",
      IBS_UF: "usuario",
      IBS_MUN: "usuario",
      IS_ADVALOREM: "usuario",
    });
    // não muta a operação do chamador
    expect(JSON.stringify(op)).toBe(antes);
    expect(r.entradaEnviada).not.toBe(op);
    expect(op.itens[0]!.aliquotasNominais).toBeUndefined();
  });

  it("preenche por campo: o campo próprio do item prevalece e o ausente vem do conjunto", async () => {
    completo();
    const f = motorFake();
    const op = operacao();
    op.itens = [
      {
        numero: 1,
        ncm: "10063021",
        cst: "200",
        cClassTrib: "200003",
        aliquotasNominais: { cbs: "7.7" } as never,
      },
    ];
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: c });
    expect(r.entradaEnviada.itens[0]!.aliquotasNominais).toEqual({
      cbs: "7.7",
      ibsEstadual: "0.05",
      ibsMunicipal: "0.05",
    });
    expect(r.origensPremissas).toEqual({ IBS_UF: "usuario", IBS_MUN: "usuario" });
  });

  it("não preenche imposto seletivo no item sem grupo de IS (mesmo com IS no conjunto)", async () => {
    completo(true);
    const f = motorFake();
    const op = operacao();
    op.itens = [op.itens[0]!];
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: c });
    expect(r.entradaEnviada.itens[0]!.aliquotasNominais).toEqual({
      cbs: "8.8",
      ibsEstadual: "0.05",
      ibsMunicipal: "0.05",
    });
    expect(Object.keys(r.origensPremissas)).not.toContain("IS_ADVALOREM");
  });

  // I2 (antes: o item com grupo de IS sem alíquota ia ao motor sem IS, em silêncio).
  it("item com grupo de IS sem alíquota própria e conjunto sem linha de IS → PREMISSA_AUSENTE citando IS; motor não chamado", async () => {
    completo(false);
    const f = motorFake();
    const e = await simularOperacao(
      { motores: f.motores, banco },
      { operacao: operacao(), conjuntoPremissasId: c },
    ).catch((x) => x);
    expect(e).toBeInstanceOf(ErroDominio);
    expect(e.codigo).toBe(PREMISSA_AUSENTE);
    expect(e.status).toBe(422);
    expect(e.message).toMatch(/IS_ADVALOREM/);
    expect(f.recebidas).toHaveLength(0);
  });

  function todosComCbsIbs(): OperacaoEntrada {
    const op = operacao();
    for (const item of op.itens) {
      item.aliquotasNominais = { cbs: "1.0", ibsEstadual: "2.0", ibsMunicipal: "3.0" };
    }
    return op;
  }

  it("todos os itens com CBS/IBS próprios e item de IS sem alíquota: usa só o IS do conjunto (sem exigir CBS/IBS dele)", async () => {
    // conjunto só com IS: antes, qualquer falta exigia CBS/IBS do conjunto (ou ignorava o IS)
    adicionarPremissa(banco, c, { tributo: "IS_ADVALOREM", aliquota: "10.0", origem: "usuario" });
    const f = motorFake();
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: todosComCbsIbs(), conjuntoPremissasId: c });
    expect(f.recebidas).toHaveLength(1);
    expect(r.entradaEnviada.itens[1]!.aliquotasNominais).toEqual({
      cbs: "1.0",
      ibsEstadual: "2.0",
      ibsMunicipal: "3.0",
      impostoSeletivo: { adValorem: "10.0" },
    });
    expect(r.entradaEnviada.itens[0]!.aliquotasNominais).toEqual({ cbs: "1.0", ibsEstadual: "2.0", ibsMunicipal: "3.0" });
    expect(r.origensPremissas).toEqual({ IS_ADVALOREM: "usuario" });
  });

  it("todos com CBS/IBS próprios, item de IS sem alíquota e conjunto sem IS → PREMISSA_AUSENTE; motor não chamado", async () => {
    completo(false);
    const f = motorFake();
    const e = await simularOperacao(
      { motores: f.motores, banco },
      { operacao: todosComCbsIbs(), conjuntoPremissasId: c },
    ).catch((x) => x);
    expect(e.codigo).toBe(PREMISSA_AUSENTE);
    expect(e.message).toMatch(/IS/);
    expect(f.recebidas).toHaveLength(0);
  });

  it("itens trazem IBS e IS, falta só a CBS: só a CBS é exigida e resolvida", async () => {
    adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    const f = motorFake();
    const op = operacao();
    for (const item of op.itens) {
      item.aliquotasNominais = { ibsEstadual: "2.0", ibsMunicipal: "3.0" } as never;
    }
    op.itens[1]!.aliquotasNominais!.impostoSeletivo = { adValorem: "5.0" };
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: c });
    expect(r.entradaEnviada.itens[1]!.aliquotasNominais).toEqual({
      cbs: "8.8",
      ibsEstadual: "2.0",
      ibsMunicipal: "3.0",
      impostoSeletivo: { adValorem: "5.0" },
    });
    expect(r.origensPremissas).toEqual({ CBS: "usuario" });
  });

  it("falta só a CBS e o conjunto não tem CBS → PREMISSA_AUSENTE citando CBS (não cita IBS)", async () => {
    adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
    const f = motorFake();
    const op = operacao();
    op.itens = [{ ...op.itens[0]!, aliquotasNominais: { ibsEstadual: "2.0", ibsMunicipal: "3.0" } as never }];
    const e = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: c }).catch(
      (x) => x,
    );
    expect(e.codigo).toBe(PREMISSA_AUSENTE);
    expect(e.message).toMatch(/CBS/);
    expect(f.recebidas).toHaveLength(0);
  });

  it("(b) conjunto sem IBS_MUN → PREMISSA_AUSENTE e o motor não é chamado", async () => {
    adicionarPremissa(banco, c, { tributo: "CBS", aliquota: "8.8", origem: "usuario" });
    adicionarPremissa(banco, c, { tributo: "IBS_UF", aliquota: "0.05", uf: "RS", origem: "usuario" });
    const f = motorFake();
    const e = await simularOperacao(
      { motores: f.motores, banco },
      { operacao: operacao(), conjuntoPremissasId: c },
    ).catch((x) => x);
    expect(e).toBeInstanceOf(ErroDominio);
    expect(e.codigo).toBe(PREMISSA_AUSENTE);
    expect(e.status).toBe(422);
    expect(f.recebidas).toHaveLength(0);
  });

  it("(c) MOTOR_INDISPONIVEL propaga como ErroDominio 503", async () => {
    completo();
    const f = motorFake(new ErroDominio(MOTOR_INDISPONIVEL, "Motor fora do ar.", 503));
    const e = await simularOperacao(
      { motores: f.motores, banco },
      { operacao: operacao(), conjuntoPremissasId: c },
    ).catch((x) => x);
    expect(e.codigo).toBe(MOTOR_INDISPONIVEL);
    expect(e.status).toBe(503);
  });

  it("resolução preguiçosa: se todos os itens já trazem as três alíquotas, não toca nas premissas", async () => {
    const f = motorFake();
    const op = operacao();
    op.itens = [op.itens[2]!];
    const r = await simularOperacao({ motores: f.motores, banco }, { operacao: op, conjuntoPremissasId: 99999 });
    expect(r.origensPremissas).toEqual({});
    expect(r.entradaEnviada.itens[0]!.aliquotasNominais).toEqual(op.itens[0]!.aliquotasNominais);
    expect(f.recebidas).toHaveLength(1);
  });
});
