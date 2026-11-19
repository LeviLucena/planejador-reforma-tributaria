import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio, NAO_ENCONTRADO } from "../dominio/erros.js";
import { UFS } from "../rotas/simulacao.js";

export type RegimeAtual = "simples" | "presumido" | "real";

export interface Empresa {
  id: number;
  razaoSocial: string;
  cnpj: string; // 14 dígitos, sem máscara
  regimeAtual: RegimeAtual;
  uf: string;
  municipioIbge: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface DadosEmpresa {
  razaoSocial: unknown;
  cnpj: unknown;
  regimeAtual: unknown;
  uf: unknown;
  municipioIbge: unknown;
}

interface Linha {
  id: number;
  razao_social: string;
  cnpj: string;
  regime_atual: RegimeAtual;
  uf: string;
  municipio_ibge: string;
  criado_em: string;
  atualizado_em: string;
}

const REGIMES = new Set<string>(["simples", "presumido", "real"]);
const COLUNAS = "id, razao_social, cnpj, regime_atual, uf, municipio_ibge, criado_em, atualizado_em";

function invalida(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

function naoEncontrada(id: number): never {
  throw new ErroDominio(NAO_ENCONTRADO, `Empresa ${id} não encontrada.`, 404);
}

function paraEmpresa(l: Linha): Empresa {
  return {
    id: l.id,
    razaoSocial: l.razao_social,
    cnpj: l.cnpj,
    regimeAtual: l.regime_atual,
    uf: l.uf,
    municipioIbge: l.municipio_ibge,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

function digitoCnpj(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i]!;
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida os dois dígitos verificadores; recusa CNPJ de dígitos repetidos. */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  const d1 = digitoCnpj(digitos, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoCnpj(digitos, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digitos[12]) && d2 === Number(digitos[13]);
}

interface Validada {
  razaoSocial: string;
  cnpj: string;
  regimeAtual: RegimeAtual;
  uf: string;
  municipioIbge: string;
}

export function validarEmpresa(d: DadosEmpresa): Validada {
  if (typeof d.razaoSocial !== "string" || d.razaoSocial.trim() === "") {
    invalida("Campo razaoSocial inválido: esperado texto não vazio.");
  }
  if (typeof d.cnpj !== "string" || !/^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(d.cnpj)) {
    invalida("Campo cnpj inválido: esperados 14 dígitos ou o formato 00.000.000/0000-00.");
  }
  const cnpj = d.cnpj.replace(/\D/g, "");
  if (!cnpjValido(cnpj)) invalida("Campo cnpj inválido: dígitos verificadores não conferem.");
  if (typeof d.regimeAtual !== "string" || !REGIMES.has(d.regimeAtual)) {
    invalida("Campo regimeAtual inválido: esperado simples, presumido ou real.");
  }
  if (typeof d.uf !== "string" || !UFS.has(d.uf)) {
    invalida("Campo uf inválido: esperada sigla de UF válida, em maiúsculas (ex.: RS).");
  }
  if (typeof d.municipioIbge !== "string" || !/^\d{7}$/.test(d.municipioIbge)) {
    invalida("Campo municipioIbge inválido: esperado texto com 7 dígitos (código IBGE).");
  }
  return {
    razaoSocial: d.razaoSocial.trim(),
    cnpj,
    regimeAtual: d.regimeAtual as RegimeAtual,
    uf: d.uf,
    municipioIbge: d.municipioIbge,
  };
}

function exigirCnpjLivre(banco: Banco, cnpj: string, ignorarId?: number): void {
  const outra = banco
    .prepare("SELECT id FROM empresa WHERE cnpj = ? AND id <> ?")
    .get(cnpj, ignorarId ?? -1);
  if (outra) invalida("Campo cnpj inválido: já existe empresa cadastrada com esse CNPJ.");
}

export function criarEmpresa(banco: Banco, dados: DadosEmpresa): Empresa {
  const v = validarEmpresa(dados);
  exigirCnpjLivre(banco, v.cnpj);
  const r = banco
    .prepare(
      "INSERT INTO empresa (razao_social, cnpj, regime_atual, uf, municipio_ibge) VALUES (?, ?, ?, ?, ?)",
    )
    .run(v.razaoSocial, v.cnpj, v.regimeAtual, v.uf, v.municipioIbge);
  return obterEmpresa(banco, Number(r.lastInsertRowid));
}

export function listarEmpresas(banco: Banco): Empresa[] {
  return (banco.prepare(`SELECT ${COLUNAS} FROM empresa ORDER BY id`).all() as Linha[]).map(paraEmpresa);
}

export function obterEmpresa(banco: Banco, id: number): Empresa {
  const l = banco.prepare(`SELECT ${COLUNAS} FROM empresa WHERE id = ?`).get(id) as Linha | undefined;
  if (!l) naoEncontrada(id);
  return paraEmpresa(l);
}

export function atualizarEmpresa(banco: Banco, id: number, dados: DadosEmpresa): Empresa {
  obterEmpresa(banco, id);
  const v = validarEmpresa(dados);
  exigirCnpjLivre(banco, v.cnpj, id);
  banco
    .prepare(
      `UPDATE empresa SET razao_social = ?, cnpj = ?, regime_atual = ?, uf = ?, municipio_ibge = ?,
         atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    )
    .run(v.razaoSocial, v.cnpj, v.regimeAtual, v.uf, v.municipioIbge, id);
  return obterEmpresa(banco, id);
}

/** Exclui a empresa; os cenários dela somem por ON DELETE CASCADE. */
export function excluirEmpresa(banco: Banco, id: number): void {
  if (banco.prepare("DELETE FROM empresa WHERE id = ?").run(id).changes === 0) naoEncontrada(id);
}
