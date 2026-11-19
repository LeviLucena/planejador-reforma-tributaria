// Valores monetários e alíquotas trafegam como strings decimais: nunca passam por float.

export interface ImpostoSeletivoAliquotas {
  adValorem?: string;
  adRem?: string;
}

export interface AliquotasNominais {
  cbs: string;
  ibsEstadual: string;
  ibsMunicipal: string;
  impostoSeletivo?: ImpostoSeletivoAliquotas;
}

export interface ImpostoSeletivoItem {
  cst?: string;
  cClassTrib?: string;
  baseCalculo?: string;
  quantidade?: string;
  unidade?: string;
  impostoInformado?: string;
}

export interface ItemEntrada {
  numero: number;
  ncm?: string;
  nbs?: string;
  cst: string;
  cClassTrib: string;
  baseCalculo?: string;
  quantidade?: string;
  unidade?: string;
  impostoSeletivo?: ImpostoSeletivoItem;
  aliquotasNominais?: AliquotasNominais;
}

export interface OperacaoEntrada {
  id: string;
  versao: string;
  dhFatoGerador: string;
  municipio: number;
  uf: string;
  itens: ItemEntrada[];
}

export interface ErroMotor {
  code: string;
  title: string;
  pointer: string;
  detail: string;
}

export interface ObjetoResultado {
  nObj: number;
  estadoItem: "CALCULO_SIMULADO" | "INCONSISTENCIA_ENTRADA" | string;
  erros?: ErroMotor[];
  // Estrutura profunda do motor oficial; mantida sem tipagem rígida.
  tribCalc?: unknown;
}

export interface ResultadoOperacao {
  objetos: ObjetoResultado[];
  total: unknown;
}

export interface ClassificacaoTributaria {
  codigo: string;
  descricao: string;
}

export interface SituacaoTributaria {
  id: number;
  codigo: string;
  descricao: string;
  classificacoesTributarias: ClassificacaoTributaria[];
}

export interface Fundamentacao {
  codigoClassificacaoTributaria: string;
  descricaoClassificacaoTributaria: string;
  codigoSituacaoTributaria: string;
  descricaoSituacaoTributaria: string;
  conjuntoTributo: string;
  texto: string;
  textoCurto: string;
  referenciaNormativa: string;
}
