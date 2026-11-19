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

## Arquivos de dados

| Arquivo | Vigência inicial | Conteúdo |
|---|---|---|
| `2027-oficial.json` | 2027-01-01 | IBS estadual e municipal de 2027-2028 (LC 214/2025, art. 344). **Sem CBS e sem IS** (ver Lacunas). Pendente de validação humana. |

As duas linhas de IBS não têm `uf`/`municipioIbge`: o art. 344 fixa a mesma alíquota para todos os
Estados e Municípios, e o resolvedor usa a linha sem UF como valor para qualquer UF/município.
O art. 344 vale de 2027-01-01 a **2028-12-31**; o conjunto não tem data final, então **não usar
este conjunto para datas a partir de 2029-01-01** (lá as alíquotas dependem de resolução do Senado).

Como a CBS está ausente, o resolvedor recusa (PREMISSA_AUSENTE) qualquer cálculo com este conjunto
até que a CBS de 2027 seja publicada e acrescentada. Isso é intencional: não se preenche por estimativa.

Detalhe linha a linha, com o trecho literal da fonte: [`PARA-VALIDACAO.md`](PARA-VALIDACAO.md).

## Lacunas (levantamento de 2026-11-18)

Itens procurados em fonte oficial e **não** gravados como linha:

1. **CBS 2027 e 2028** — a LC 214/2025, art. 347, manda usar a alíquota fixada nos termos do
   art. 14 (lei da União ou, na falta, a alíquota de referência), reduzida em 0,1 ponto percentual;
   a alíquota de referência de 2027 é fixada por resolução do Senado (LC 214/2025, art. 349, I;
   ADCT art. 130). Em 2026-11-18 **não há resolução do Senado publicada**: o TCU calculou 11,3% e
   entregou ao Senado em 2026-11-10; o Senado Notícias informa prazo até 15/12/2026 e que o projeto de
   resolução ainda tramita (relator designado, audiência na CAE). O cálculo do TCU **não** é alíquota
   vigente (só seria usado na hipótese do art. 349, § 2º), por isso não virou linha. Não foi
   localizada lei específica da União fixando a CBS. Buscas: "resolução do Senado Federal alíquota de
   referência CBS 2027"; "Senado aprova projeto de resolução alíquota de referência CBS"
   (sites senado.leg.br, tcu.gov.br, gov.br).
   Observação: o texto do art. 349, § 1º, II, no Planalto fala em fixação "até o dia 31 de outubro";
   as notícias do Senado falam em 15 de dezembro. A divergência não foi resolvida nesta pesquisa.
2. **Imposto Seletivo (IS_ADVALOREM / IS_ADREM)** — a LC 214/2025 (arts. 419, 421, 422) remete as
   alíquotas à lei ordinária. Existe a **Medida Provisória nº 1.399, de 4 de novembro de 2026**
   (texto obtido no site do Senado), que fixa as alíquotas do IS para 2027, **por produto**
   (alíquota inicial da TIPI ou alíquota-base de veículos × fatores de conversão dos Anexos IV e V;
   art. 3º), com efeitos a partir de **2 de fevereiro de 2027** (art. 19) e regras transitórias até
   31/12/2027 (art. 6º). Não virou linha porque: (a) as alíquotas variam por NCM/produto, e este
   formato só tem uma alíquota de IS por conjunto, que valeria para todos os itens; (b) a vigência
   começa em 2027-02-02, diferente deste conjunto; (c) é MP ainda não convertida em lei. Se for
   preciso, deve ser premissa por item, decidida com o usuário/contador.
3. **IBS 2027-2028 por UF ou por município** — não há alíquotas próprias de Estados/Municípios para
   2027-2028: o art. 344 fixa 0,05% + 0,05% para todos. Nada a gravar além das linhas nacionais.
4. **IBS de 2029 em diante (referência estadual/municipal)** — fixado por resolução do Senado para
   2029-2033 (LC 214/2025, art. 349, II); nenhuma publicada. Sem arquivo para 2029+.
5. **CBS e IBS de 2029 em diante** — idem; dependem de resoluções futuras do Senado. As frações de
   redução do ICMS/ISS de 2029-2032 (ADCT art. 128: 9/10, 8/10, 7/10, 6/10) existem na lei, mas
   não são alíquotas de CBS/IBS/IS e não cabem neste formato.
6. **Redutor de compras governamentais** (LC 214/2025, art. 349, III) — não é alíquota deste
   formato; o TCU calculou um valor, mas não há resolução publicada.
