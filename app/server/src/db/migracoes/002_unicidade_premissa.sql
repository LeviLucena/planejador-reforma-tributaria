CREATE UNIQUE INDEX ux_premissa ON premissa_aliquota (conjunto_id, tributo, COALESCE(uf, ''), COALESCE(municipio_ibge, ''));
