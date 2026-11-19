-- Um CNPJ (14 dígitos, sem máscara) identifica uma única empresa.
CREATE UNIQUE INDEX empresa_cnpj_unico ON empresa (cnpj);
