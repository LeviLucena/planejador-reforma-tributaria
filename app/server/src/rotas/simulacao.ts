import type { FastifyInstance } from "fastify";
import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio } from "../dominio/erros.js";
import { UFS } from "../dominio/ufs.js";
import type { OperacaoEntrada } from "../dominio/tipos.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { simularOperacao } from "../simulacao/servico.js";

const RE_DH = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function invalida(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const presente = (v: unknown) => v !== undefined && v !== null;

function dataReal(dh: unknown): boolean {
  const m = typeof dh === "string" ? RE_DH.exec(dh) : null;
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function digitos(v: unknown, n: number): boolean {
  return typeof v === "string" && v.length === n && /^[0-9]+$/.test(v);
}

export function validarConjuntoId(v: unknown): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    invalida("Campo conjuntoPremissasId inválido: esperado número inteiro positivo.");
  }
  return v;
}

export function validarOperacao(op: unknown): OperacaoEntrada {
  if (!ehObjeto(op)) invalida("Campo operacao ausente ou inválido: esperado um objeto.");
  if (typeof op.id !== "string") invalida("Campo id inválido: esperado texto.");
  if (typeof op.versao !== "string") invalida("Campo versao inválido: esperado texto.");
  if (!dataReal(op.dhFatoGerador)) {
    invalida("Campo dhFatoGerador inválido: esperado data e hora ISO-8601 com deslocamento (ex.: 2027-03-10T10:00:00-03:00) e data real.");
  }
  if (typeof op.uf !== "string" || !UFS.has(op.uf)) {
    invalida("Campo uf inválido: esperada sigla de UF válida, em maiúsculas (ex.: RS).");
  }
  if (typeof op.municipio !== "number" || !Number.isInteger(op.municipio) || !/^\d{7}$/.test(String(op.municipio))) {
    invalida("Campo municipio inválido: esperado número inteiro IBGE de 7 dígitos.");
  }
  if (!Array.isArray(op.itens) || op.itens.length === 0) {
    invalida("Campo itens inválido: esperada uma lista com ao menos um item.");
  }
  op.itens.forEach((it: unknown, i: number) => {
    const rot = `itens[${i}]`;
    if (!ehObjeto(it)) invalida(`Campo ${rot} inválido: esperado um objeto.`);
    if (typeof it.numero !== "number" || !Number.isInteger(it.numero)) {
      invalida(`Campo ${rot}.numero inválido: esperado número inteiro.`);
    }
    if (!digitos(it.cst, 3)) invalida(`Campo ${rot}.cst inválido: esperados exatamente 3 dígitos.`);
    if (!digitos(it.cClassTrib, 6)) invalida(`Campo ${rot}.cClassTrib inválido: esperados exatamente 6 dígitos.`);
    if (presente(it.ncm) === presente(it.nbs)) {
      invalida(`Campo ${rot}.ncm/nbs inválido: informe exatamente um dos dois (ncm com 8 dígitos ou nbs com 9 dígitos).`);
    }
    if (presente(it.ncm) && !digitos(it.ncm, 8)) invalida(`Campo ${rot}.ncm inválido: esperados exatamente 8 dígitos.`);
    if (presente(it.nbs) && !digitos(it.nbs, 9)) invalida(`Campo ${rot}.nbs inválido: esperados exatamente 9 dígitos.`);
  });
  return op as unknown as OperacaoEntrada;
}

function validarCorpo(corpo: unknown): { operacao: OperacaoEntrada; conjuntoPremissasId: number } {
  if (!ehObjeto(corpo)) invalida("Corpo da requisição inválido: esperado um objeto com operacao e conjuntoPremissasId.");
  const operacao = validarOperacao(corpo.operacao);
  return { operacao, conjuntoPremissasId: validarConjuntoId(corpo.conjuntoPremissasId) };
}

export function rotasSimulacao(deps: { motores: MotoresPort; banco: Banco }) {
  return async function (app: FastifyInstance): Promise<void> {
    app.post("/api/simular", async (req) => {
      const entrada = validarCorpo(req.body);
      return simularOperacao(deps, entrada);
    });
  };
}
