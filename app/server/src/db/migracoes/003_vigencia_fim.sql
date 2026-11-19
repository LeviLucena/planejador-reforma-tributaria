-- Data de término (inclusiva) da vigência do conjunto; NULL = sem término conhecido.
ALTER TABLE conjunto_premissas ADD COLUMN vigencia_fim TEXT;
