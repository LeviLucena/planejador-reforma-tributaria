import type { Banco } from "../db/banco.js";
import { ENTRADA_INVALIDA, ErroDominio, NAO_ENCONTRADO, PREMISSA_AUSENTE } from "../dominio/erros.js";
import type { OperacaoEntrada, ResultadoOperacao } from "../dominio/tipos.js";
import { obterEmpresa } from "../empresas/repositorio.js";
import type { MotoresPort } from "../motores/regimeRegular.js";
import { simularOperacao, type RespostaSimulacao } from "../simulacao/servico.js";

export interface Cenario {
  id: number;
  empresaId: number;
  nome: string;
  versaoNumero: number;
  /** A operação exatamente como o chamador enviou (antes do preenchimento por premissas). */
  entrada: OperacaoEntrada;
  /** O que de fato foi ao motor (alíquotas já preenchidas). */
  readonly entradaEnviada: OperacaoEntrada;
  readonly origensPremissas: Record<string, string>;
  /** Resultado congelado: reabrir nunca chama o motor. */
  resultado: ResultadoOperacao;
  versaoMotor: string;
  conjuntoPremissasId: number;
  criadoEm: string;
}

export interface DadosCenario {
  empresaId: number;
  nome: string;
  operacao: OperacaoEntrada;
  conjuntoPremissasId: number;
}

interface Deps {
  motores: MotoresPort;
  banco: Banco;
}

interface Linha {
  id: number;
  empresa_id: number;
  nome: string;
  versao_numero: number;
  entrada_json: string;
  resultado_json: string;
  versao_motor: string;
  conjunto_premissas_id: number;
  criado_em: string;
}

const COLUNAS =
  "id, empresa_id, nome, versao_numero, entrada_json, resultado_json, versao_motor, conjunto_premissas_id, criado_em";

function invalida(mensagem: string): never {
  throw new ErroDominio(ENTRADA_INVALIDA, mensagem, 400);
}

function paraCenario(l: Linha): Cenario {
  const e = JSON.parse(l.entrada_json) as {
    operacao: OperacaoEntrada;
    entradaEnviada: OperacaoEntrada;
    origensPremissas: Record<string, string>;
  };
  return {
    id: l.id,
    empresaId: l.empresa_id,
    nome: l.nome,
    versaoNumero: l.versao_numero,
    entrada: e.operacao,
    entradaEnviada: e.entradaEnviada,
    origensPremissas: e.origensPremissas,
    resultado: JSON.parse(l.resultado_json) as ResultadoOperacao,
    versaoMotor: l.versao_motor,
    conjuntoPremissasId: l.conjunto_premissas_id,
    criadoEm: l.criado_em,
  };
}

/**
 * Texto determinístico com as versões dos motores no momento do cálculo.
 * Formato: `regular=<app>+<db>; simples=<app>/<db>` (ex.: `regular=1.6.1+V0059; simples=0.0.6/V0059`).
 */
async function descreverVersaoMotor(motores: MotoresPort): Promise<string> {
  const v = await motores.versoes();
  return `regular=${v.regimeRegular}; simples=${v.simples.app}/${v.simples.db}`;
}

function exigirConjunto(banco: Banco, id: number): void {
  if (!banco.prepare("SELECT 1 FROM conjunto_premissas WHERE id = ?").get(id)) {
    throw new ErroDominio(PREMISSA_AUSENTE, `Conjunto de premissas ${id} não existe.`, 422);
  }
}

function naoEncontrado(id: number): never {
  throw new ErroDominio(NAO_ENCONTRADO, `Cenário ${id} não encontrado.`, 404);
}

function inserir(
  banco: Banco,
  d: { empresaId: number; nome: string; operacao: OperacaoEntrada; conjuntoPremissasId: number },
  sim: RespostaSimulacao,
  versaoMotor: string,
  versaoNumero: (banco: Banco) => number,
): Cenario {
  const entradaJson = JSON.stringify({
    operacao: d.operacao,
    entradaEnviada: sim.entradaEnviada,
    origensPremissas: sim.origensPremissas,
  });
  const id = banco.transaction(() => {
    const r = banco
      .prepare(
        `INSERT INTO cenario (empresa_id, nome, versao_numero, entrada_json, resultado_json, versao_motor, conjunto_premissas_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.empresaId,
        d.nome,
        versaoNumero(banco),
        entradaJson,
        JSON.stringify(sim.resultado),
        versaoMotor,
        d.conjuntoPremissasId,
      );
    return Number(r.lastInsertRowid);
  })();
  return reabrirCenario(banco, id);
}

const existeNome = (banco: Banco, empresaId: number, nome: string) =>
  banco.prepare("SELECT 1 FROM cenario WHERE empresa_id = ? AND nome = ?").get(empresaId, nome) !== undefined;

/** Simula primeiro; só grava (versão 1) se a simulação tiver sucesso. */
export async function salvarCenario(deps: Deps, dados: DadosCenario): Promise<Cenario> {
  const { banco, motores } = deps;
  if (typeof dados.nome !== "string" || dados.nome.trim() === "") {
    invalida("Campo nome inválido: esperado texto não vazio.");
  }
  const nome = dados.nome.trim();
  obterEmpresa(banco, dados.empresaId);
  exigirConjunto(banco, dados.conjuntoPremissasId);
  if (existeNome(banco, dados.empresaId, nome)) {
    invalida("Já existe cenário com esse nome; use recalcular ou outro nome.");
  }
  const sim = await simularOperacao(deps, {
    operacao: dados.operacao,
    conjuntoPremissasId: dados.conjuntoPremissasId,
  });
  const versaoMotor = await descreverVersaoMotor(motores);
  // Reconferido após o await: outra requisição pode ter gravado o mesmo nome nesse intervalo.
  if (existeNome(banco, dados.empresaId, nome)) {
    invalida("Já existe cenário com esse nome; use recalcular ou outro nome.");
  }
  return inserir(banco, { ...dados, nome }, sim, versaoMotor, () => 1);
}

/** Lê somente o banco: o resultado é o que foi gravado, sem tocar os motores. */
export function reabrirCenario(banco: Banco, id: number): Cenario {
  const l = banco.prepare(`SELECT ${COLUNAS} FROM cenario WHERE id = ?`).get(id) as Linha | undefined;
  if (!l) naoEncontrado(id);
  return paraCenario(l);
}

/** Re-simula a operação gravada e cria nova versão (MAX+1); as anteriores ficam intactas. */
export async function recalcularCenario(deps: Deps, id: number): Promise<Cenario> {
  const { banco, motores } = deps;
  const base = reabrirCenario(banco, id);
  const sim = await simularOperacao(deps, {
    operacao: base.entrada,
    conjuntoPremissasId: base.conjuntoPremissasId,
  });
  const versaoMotor = await descreverVersaoMotor(motores);
  return inserir(
    banco,
    { empresaId: base.empresaId, nome: base.nome, operacao: base.entrada, conjuntoPremissasId: base.conjuntoPremissasId },
    sim,
    versaoMotor,
    (b) =>
      (
        b
          .prepare("SELECT COALESCE(MAX(versao_numero), 0) + 1 AS n FROM cenario WHERE empresa_id = ? AND nome = ?")
          .get(base.empresaId, base.nome) as { n: number }
      ).n,
  );
}

export function listarCenarios(banco: Banco, empresaId: number): Cenario[] {
  return (
    banco
      .prepare(`SELECT ${COLUNAS} FROM cenario WHERE empresa_id = ? ORDER BY nome, versao_numero`)
      .all(empresaId) as Linha[]
  ).map(paraCenario);
}
