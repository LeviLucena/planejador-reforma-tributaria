# Premissas de alíquota

Arquivos JSON com alíquotas que o app usa como premissas de cálculo. Cada arquivo vira **um**
conjunto de premissas (tabela `conjunto_premissas`) com suas linhas (`premissa_aliquota`).

## Formato do arquivo

Esquema formal: [`schema.json`](schema.json). Estrutura:

```json
{
  "conjunto": { "nome": "texto", "vigenciaInicio": "AAAA-MM-DD", "observacao": "texto (opcional)" },
  "linhas": [
    {
      "tributo": "CBS | IBS_UF | IBS_MUN | IS_ADVALOREM | IS_ADREM",
      "uf": "SP (só IBS_UF/IBS_MUN)",
      "municipioIbge": 3550308,
      "aliquota": "0.9",
      "origem": "oficial | lei_transicao | usuario",
      "fonteNorma": "norma e número",
      "fonteArtigo": "artigo/inciso/parágrafo exato",
      "consultadoEm": "AAAA-MM-DD"
    }
  ]
}
```

Regras aplicadas por `carregarArquivo` (`app/server/src/premissas/carregador.ts`):

- **Esquema estrito**: campo desconhecido na raiz, no conjunto ou numa linha rejeita o arquivo.
- **Unidade da alíquota: percentual**, como texto decimal com ponto. `"8.8"` = 8,8%; `"0.9"` = 0,9%;
  `"0.1"` = 0,1%. É a mesma convenção dos campos `aliquotasNominais` dos motores
  (ver `motores/teste-operacao.json`: `"cbs": 8.8` = 8,8%). Nunca número JSON, nunca fração (0,009).
- Linhas `oficial` ou `lei_transicao` **exigem** `fonteNorma`, `fonteArtigo` e `consultadoEm`;
  a mensagem de erro indica o índice da linha (começando em 0) e o campo faltante.
- Linhas `usuario` não exigem fonte (cenários do próprio usuário e testes).
- CBS e IS são nacionais (sem `uf`/`municipioIbge`); duplicata de tributo+UF+município no mesmo
  arquivo é rejeitada.
- Um conjunto tem **uma única** `vigenciaInicio`. Valores com vigências diferentes vão em
  arquivos diferentes.
- **Tudo ou nada**: o arquivo inteiro é validado antes de gravar, e a gravação ocorre numa única
  transação. Arquivo rejeitado não deixa nada no banco (nem o conjunto).
- `validado_por` / `validado_em` **nunca** são preenchidos pelo carregador; só o usuário valida.

Carregar no banco do app (`config.caminhoBanco`, ou a variável `CAMINHO_BANCO`):

```
npm -w app/server run premissas:carregar -- dados/premissas/2027-oficial.json
```
