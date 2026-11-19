CREATE TABLE empresa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  regime_atual TEXT NOT NULL,
  uf TEXT NOT NULL,
  municipio_ibge TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE conjunto_premissas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  vigencia_inicio TEXT NOT NULL,
  observacao TEXT,
  validado_por TEXT,
  validado_em TEXT
);

CREATE TABLE premissa_aliquota (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conjunto_id INTEGER NOT NULL REFERENCES conjunto_premissas(id) ON DELETE CASCADE,
  tributo TEXT NOT NULL CHECK (tributo IN ('CBS','IBS_UF','IBS_MUN','IS_ADVALOREM','IS_ADREM')),
  uf TEXT,
  municipio_ibge TEXT,
  aliquota TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('oficial','lei_transicao','usuario')),
  fonte_norma TEXT,
  fonte_artigo TEXT,
  consultado_em TEXT,
  CHECK (origem = 'usuario' OR (fonte_norma IS NOT NULL AND fonte_norma <> '' AND fonte_artigo IS NOT NULL AND fonte_artigo <> '' AND consultado_em IS NOT NULL))
);

CREATE TABLE cenario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  versao_numero INTEGER NOT NULL,
  entrada_json TEXT NOT NULL,
  resultado_json TEXT NOT NULL,
  versao_motor TEXT NOT NULL,
  conjunto_premissas_id INTEGER NOT NULL REFERENCES conjunto_premissas(id),
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (empresa_id, nome, versao_numero)
);
