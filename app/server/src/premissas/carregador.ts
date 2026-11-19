import { readFileSync } from "node:fs";
import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio } from "../dominio/erros.js";
import {
  adicionarPremissa,
  criarConjunto,
  validarDataIso,
  type PremissaEntrada,
} from "./repositorio.js";

/** Campos aceitos em cada linha (mesmos de dados/premissas/schema.json). */
export const CAMPOS_LINHA = [
  "tributo",
  "uf",
  "municipioIbge",
  "aliquota",
  "origem",
  "fonteNorma",
  "fonteArtigo",
  "consultadoEm",
] as const;

/** Campos aceitos no objeto "conjunto" (mesmos de dados/premissas/schema.json). */
export const CAMPOS_CONJUNTO = ["nome", "vigenciaInicio", "observacao"] as const;

const CAMPOS_RAIZ = ["conjunto", "linhas"] as const;
const TRIBUTOS = ["CBS", "IBS_UF", "IBS_MUN", "IS_ADVALOREM", "IS_ADREM"];
const ORIGENS = ["oficial", "lei_transicao", "usuario"];
const DECIMAL = /^\d+(\.\d+)?$/;

function invalido(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function semCamposExtras(obj: Record<string, unknown>, aceitos: readonly string[], onde: string): void {
  const extras = Object.keys(obj).filter((k) => !aceitos.includes(k));
  if (extras.length > 0) invalido(`${onde}: campo(s) desconhecido(s): ${extras.join(", ")}.`);
}

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function validarLinha(bruta: unknown, i: number): PremissaEntrada {
  const onde = `Arquivo de premissas, linha ${i}`;
  if (!ehObjeto(bruta)) invalido(`${onde}: esperado um objeto.`);
  semCamposExtras(bruta, CAMPOS_LINHA, onde);

  const { tributo, uf, municipioIbge, aliquota, origem, fonteNorma, fonteArtigo, consultadoEm } = bruta;
  if (typeof tributo !== "string" || !TRIBUTOS.includes(tributo)) {
    invalido(`${onde}: campo tributo inválido ("${String(tributo)}").`);
  }
  if (typeof origem !== "string" || !ORIGENS.includes(origem)) {
    invalido(`${onde}: campo origem inválido ("${String(origem)}").`);
  }
  if (typeof aliquota !== "string" || !DECIMAL.test(aliquota)) {
    invalido(`${onde}: campo aliquota deve ser texto decimal (ex.: "8.8"), recebido ${JSON.stringify(aliquota)}.`);
  }
  if (uf !== undefined && (typeof uf !== "string" || !/^[A-Za-z]{2}$/.test(uf))) {
    invalido(`${onde}: campo uf deve ter duas letras, recebido ${JSON.stringify(uf)}.`);
  }
  if (municipioIbge !== undefined && (typeof municipioIbge !== "number" || !Number.isInteger(municipioIbge) || municipioIbge <= 0)) {
    invalido(`${onde}: campo municipioIbge deve ser inteiro positivo, recebido ${JSON.stringify(municipioIbge)}.`);
  }
  for (const [nome, valor] of [
    ["fonteNorma", fonteNorma],
    ["fonteArtigo", fonteArtigo],
    ["consultadoEm", consultadoEm],
  ] as const) {
    if (valor !== undefined && typeof valor !== "string") invalido(`${onde}: campo ${nome} deve ser texto.`);
  }
  if (origem !== "usuario") {
    const faltam = (
      [
        ["fonteNorma", fonteNorma],
        ["fonteArtigo", fonteArtigo],
        ["consultadoEm", consultadoEm],
      ] as const
    )
      .filter(([, v]) => !textoNaoVazio(v))
      .map(([n]) => n);
    if (faltam.length > 0) {
      invalido(`${onde}: origem ${origem} exige fonte obrigatória; faltando: ${faltam.join(", ")}.`);
    }
  }
  if (consultadoEm !== undefined) {
    try {
      validarDataIso(consultadoEm as string, "consultadoEm");
    } catch (e) {
      invalido(`${onde}: ${(e as Error).message}`);
    }
  }

  const linha: PremissaEntrada = {
    tributo: tributo as PremissaEntrada["tributo"],
    aliquota: aliquota as string,
    origem: origem as PremissaEntrada["origem"],
  };
  if (uf !== undefined) linha.uf = uf as string;
  if (municipioIbge !== undefined) linha.municipioIbge = municipioIbge as number;
  if (fonteNorma !== undefined) linha.fonteNorma = fonteNorma as string;
  if (fonteArtigo !== undefined) linha.fonteArtigo = fonteArtigo as string;
  if (consultadoEm !== undefined) linha.consultadoEm = consultadoEm as string;
  return linha;
}

function validarArquivo(dados: unknown): {
  conjunto: { nome: string; vigenciaInicio: string; observacao?: string };
  linhas: PremissaEntrada[];
} {
  if (!ehObjeto(dados)) invalido("Arquivo de premissas: a raiz deve ser um objeto { conjunto, linhas }.");
  semCamposExtras(dados, CAMPOS_RAIZ, "Arquivo de premissas (raiz)");
  const c = dados.conjunto;
  if (!ehObjeto(c)) invalido("Arquivo de premissas: campo conjunto ausente ou não é objeto.");
  semCamposExtras(c, CAMPOS_CONJUNTO, "Arquivo de premissas, conjunto");
  if (!textoNaoVazio(c.nome)) invalido("Arquivo de premissas, conjunto: campo nome obrigatório.");
  if (typeof c.vigenciaInicio !== "string") {
    invalido("Arquivo de premissas, conjunto: campo vigenciaInicio obrigatório (AAAA-MM-DD).");
  }
  try {
    validarDataIso(c.vigenciaInicio, "vigenciaInicio");
  } catch (e) {
    invalido(`Arquivo de premissas, conjunto: ${(e as Error).message}`);
  }
  if (c.observacao !== undefined && typeof c.observacao !== "string") {
    invalido("Arquivo de premissas, conjunto: campo observacao deve ser texto.");
  }
  if (!Array.isArray(dados.linhas)) invalido("Arquivo de premissas: campo linhas ausente ou não é lista.");

  const conjunto: { nome: string; vigenciaInicio: string; observacao?: string } = {
    nome: c.nome,
    vigenciaInicio: c.vigenciaInicio,
  };
  if (c.observacao !== undefined) conjunto.observacao = c.observacao as string;
  return { conjunto, linhas: dados.linhas.map((l, i) => validarLinha(l, i)) };
}

/**
 * Lê um arquivo de premissas (formato em dados/premissas/README.md), valida o arquivo
 * inteiro e grava conjunto + linhas numa única transação: se algo falhar, nada é gravado.
 * Nunca preenche validado_por/validado_em (só o usuário valida).
 */
export function carregarArquivo(banco: Banco, caminho: string): { conjuntoId: number; linhas: number } {
  let texto: string;
  try {
    texto = readFileSync(caminho, "utf8");
  } catch (e) {
    invalido(`Não foi possível ler o arquivo de premissas "${caminho}": ${(e as Error).message}`);
  }
  let dados: unknown;
  try {
    dados = JSON.parse(texto.replace(/^﻿/, ""));
  } catch (e) {
    invalido(`Arquivo de premissas "${caminho}" não é JSON válido: ${(e as Error).message}`);
  }
  const { conjunto, linhas } = validarArquivo(dados);

  return banco.transaction(() => {
    const conjuntoId = criarConjunto(banco, conjunto);
    linhas.forEach((linha, i) => {
      try {
        adicionarPremissa(banco, conjuntoId, linha);
      } catch (e) {
        if (e instanceof ErroDominio) invalido(`Arquivo de premissas, linha ${i}: ${e.message}`);
        throw e;
      }
    });
    return { conjuntoId, linhas: linhas.length };
  })();
}
