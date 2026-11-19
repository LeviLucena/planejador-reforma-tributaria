import type {
  AliquotasNominais,
  ImpostoSeletivoItem,
  ItemEntrada,
  OperacaoEntrada,
} from "../../../server/src/dominio/tipos";
import type { RequisicaoSimulacao } from "../../../server/src/simulacao/servico";
import { paraIsoComDeslocamento } from "../formatacao";

// Valores monetários e alíquotas ficam como TEXTO do começo ao fim: nunca viram Number.

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

export interface ItemForm {
  chave: number;
  tipoCodigo: "ncm" | "nbs";
  codigo: string;
  cst: string;
  cClassTrib: string;
  baseCalculo: string;
  quantidade: string;
  unidade: string;
  cbs: string;
  ibsEstadual: string;
  ibsMunicipal: string;
  isAberto: boolean;
  isCst: string;
  isCClassTrib: string;
  isBaseCalculo: string;
  isQuantidade: string;
  isUnidade: string;
  isImpostoInformado: string;
  isAdValorem: string;
}

export interface FormSimulador {
  uf: string;
  municipio: string;
  dataHora: string;
  conjuntoId: string;
  itens: ItemForm[];
}

export function itemVazio(chave: number): ItemForm {
  return {
    chave,
    tipoCodigo: "ncm",
    codigo: "",
    cst: "",
    cClassTrib: "",
    baseCalculo: "",
    quantidade: "",
    unidade: "",
    cbs: "",
    ibsEstadual: "",
    ibsMunicipal: "",
    isAberto: false,
    isCst: "",
    isCClassTrib: "",
    isBaseCalculo: "",
    isQuantidade: "",
    isUnidade: "",
    isImpostoInformado: "",
    isAdValorem: "",
  };
}

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));

interface ExemploItem {
  ncm?: string;
  nbs?: string;
  cst?: string;
  cClassTrib?: string;
  baseCalculo?: number | string;
  quantidade?: number | string;
  unidade?: string;
  impostoSeletivo?: Record<string, number | string | undefined>;
  aliquotasNominais?: {
    cbs?: number | string;
    ibsEstadual?: number | string;
    ibsMunicipal?: number | string;
    impostoSeletivo?: { adValorem?: number | string };
  };
}
export interface Exemplo {
  dhFatoGerador: string;
  municipio: number | string;
  uf: string;
  itens: ExemploItem[];
}

/** Converte a operação do exemplo oficial (números JSON) em campos de texto do formulário. */
export function formularioDoExemplo(ex: Exemplo): Omit<FormSimulador, "conjuntoId"> {
  return {
    uf: ex.uf,
    municipio: texto(ex.municipio),
    dataHora: ex.dhFatoGerador.slice(0, 16),
    itens: ex.itens.map((it, i) => {
      const is = it.impostoSeletivo;
      const a = it.aliquotasNominais;
      return {
        ...itemVazio(i + 1),
        tipoCodigo: it.nbs !== undefined ? "nbs" : "ncm",
        codigo: texto(it.nbs ?? it.ncm),
        cst: texto(it.cst),
        cClassTrib: texto(it.cClassTrib),
        baseCalculo: texto(it.baseCalculo),
        quantidade: texto(it.quantidade),
        unidade: texto(it.unidade),
        cbs: texto(a?.cbs),
        ibsEstadual: texto(a?.ibsEstadual),
        ibsMunicipal: texto(a?.ibsMunicipal),
        isAberto: is !== undefined,
        isCst: texto(is?.cst),
        isCClassTrib: texto(is?.cClassTrib),
        isBaseCalculo: texto(is?.baseCalculo),
        isQuantidade: texto(is?.quantidade),
        isUnidade: texto(is?.unidade),
        isImpostoInformado: texto(is?.impostoInformado),
        isAdValorem: texto(a?.impostoSeletivo?.adValorem),
      };
    }),
  };
}

const RE_DECIMAL = /^\d+(?:[.,]\d+)?$/;
const vazio = (v: string) => v.trim() === "";
/** "100,50" vira "100.50" (só troca o separador; os dígitos seguem como digitados). */
const decimal = (v: string) => v.trim().replace(",", ".");

const DECIMAIS: [keyof ItemForm, string][] = [
  ["baseCalculo", "Base de cálculo"],
  ["quantidade", "Quantidade"],
  ["cbs", "Alíquota da CBS"],
  ["ibsEstadual", "Alíquota do IBS estadual"],
  ["ibsMunicipal", "Alíquota do IBS municipal"],
  ["isBaseCalculo", "Base de cálculo do IS"],
  ["isQuantidade", "Quantidade do IS"],
  ["isImpostoInformado", "Imposto informado do IS"],
  ["isAdValorem", "Alíquota ad valorem do IS"],
];

export function validar(f: FormSimulador): Record<string, string> {
  const e: Record<string, string> = {};
  if (!UFS.includes(f.uf)) e.uf = "Selecione a UF da operação.";
  if (!/^\d{7}$/.test(f.municipio)) e.municipio = "O município deve ter exatamente 7 dígitos (código IBGE).";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.dataHora)) e.dataHora = "Informe a data e a hora do fato gerador.";
  if (!/^\d+$/.test(f.conjuntoId)) e.conjunto = "Selecione um conjunto de premissas.";
  if (f.itens.length === 0) e.itens = "Inclua pelo menos um item na operação.";
  for (const it of f.itens) {
    const k = `i${it.chave}`;
    const digitos = it.tipoCodigo === "ncm" ? 8 : 9;
    const nome = it.tipoCodigo === "ncm" ? "NCM" : "NBS";
    if (!new RegExp(`^\\d{${digitos}}$`).test(it.codigo)) {
      e[`${k}.codigo`] = `O código ${nome} deve ter exatamente ${digitos} dígitos (informe só um: NCM ou NBS).`;
    }
    if (!/^\d{3}$/.test(it.cst)) e[`${k}.cst`] = "O CST deve ter exatamente 3 dígitos.";
    if (!/^\d{6}$/.test(it.cClassTrib)) e[`${k}.cClassTrib`] = "O cClassTrib deve ter exatamente 6 dígitos.";
    for (const [campo, rotulo] of DECIMAIS) {
      const v = it[campo] as string;
      if (!vazio(v) && !RE_DECIMAL.test(v.trim())) e[`${k}.${campo}`] = `${rotulo}: use apenas números (ex.: 100,50).`;
    }
    if (!vazio(it.isCst) && !/^\d{3}$/.test(it.isCst)) e[`${k}.isCst`] = "O CST do IS deve ter exatamente 3 dígitos.";
    if (!vazio(it.isCClassTrib) && !/^\d{6}$/.test(it.isCClassTrib)) {
      e[`${k}.isCClassTrib`] = "O cClassTrib do IS deve ter exatamente 6 dígitos.";
    }
  }
  return e;
}

function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function montarItem(it: ItemForm, numero: number): ItemEntrada {
  const item: ItemEntrada = { numero, cst: it.cst, cClassTrib: it.cClassTrib };
  if (it.tipoCodigo === "ncm") item.ncm = it.codigo;
  else item.nbs = it.codigo;
  if (!vazio(it.baseCalculo)) item.baseCalculo = decimal(it.baseCalculo);
  if (!vazio(it.quantidade)) item.quantidade = decimal(it.quantidade);
  if (!vazio(it.unidade)) item.unidade = it.unidade.trim();

  const is: ImpostoSeletivoItem = {};
  if (!vazio(it.isCst)) is.cst = it.isCst;
  if (!vazio(it.isCClassTrib)) is.cClassTrib = it.isCClassTrib;
  if (!vazio(it.isBaseCalculo)) is.baseCalculo = decimal(it.isBaseCalculo);
  if (!vazio(it.isQuantidade)) is.quantidade = decimal(it.isQuantidade);
  if (!vazio(it.isUnidade)) is.unidade = it.isUnidade.trim();
  if (!vazio(it.isImpostoInformado)) is.impostoInformado = decimal(it.isImpostoInformado);
  if (Object.keys(is).length > 0) item.impostoSeletivo = is;

  // Alíquota em branco = "usar as premissas": o servidor completa o que faltar.
  const nominais: Partial<AliquotasNominais> = {};
  if (!vazio(it.cbs)) nominais.cbs = decimal(it.cbs);
  if (!vazio(it.ibsEstadual)) nominais.ibsEstadual = decimal(it.ibsEstadual);
  if (!vazio(it.ibsMunicipal)) nominais.ibsMunicipal = decimal(it.ibsMunicipal);
  if (!vazio(it.isAdValorem)) nominais.impostoSeletivo = { adValorem: decimal(it.isAdValorem) };
  if (Object.keys(nominais).length > 0) item.aliquotasNominais = nominais as AliquotasNominais;
  return item;
}

/** Pressupõe que validar(f) não devolveu erros. */
export function montarRequisicao(f: FormSimulador): RequisicaoSimulacao {
  const operacao: OperacaoEntrada = {
    id: novoId(),
    versao: "1.0.0",
    dhFatoGerador: paraIsoComDeslocamento(f.dataHora) as string,
    municipio: Number(f.municipio),
    uf: f.uf,
    itens: f.itens.map((it, i) => montarItem(it, i + 1)),
  };
  return { operacao, conjuntoPremissasId: Number(f.conjuntoId) };
}
