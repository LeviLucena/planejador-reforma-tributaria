# Premissas para validação

**Nenhuma linha foi validada por humano. `validado_por` está vazio.**

Levantamento feito em 2026-11-18. Alíquotas em percentual (`"0.05"` = 0,05%). Arquivo:
`dados/premissas/2027-oficial.json` (conjunto com vigência de 2027-01-01 a 2028-12-31, que é o
período do art. 344; `vigenciaFim` = 2028-12-31 é dado do conjunto, não uma linha).

| # | Tributo | Valor | Origem | Norma | Artigo | URL consultada | Trecho literal da fonte |
|---|---|---|---|---|---|---|---|
| 0 | IBS_UF (todas as UFs) | 0.05 | lei_transicao | Lei Complementar nº 214, de 16 de janeiro de 2025 | art. 344, caput | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm | "Em relação aos fatos geradores ocorridos de 1º de janeiro de 2027 a 31 de dezembro de 2028, o IBS será cobrado à alíquota estadual de 0,05% (cinco centésimos por cento)" |
| 1 | IBS_MUN (todos os municípios) | 0.05 | lei_transicao | Lei Complementar nº 214, de 16 de janeiro de 2025 | art. 344, caput | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm | "[...] o IBS será cobrado à alíquota estadual de 0,05% (cinco centésimos por cento) e à alíquota municipal de 0,05% (cinco centésimos por cento)." |

Confirmação constitucional das duas linhas (mesmo valor e período), ADCT art. 127, incluído pela
EC nº 132/2023 — https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm:
"Em 2027 e 2028, o imposto previsto no art. 156-A da Constituição Federal será cobrado à alíquota
estadual de 0,05% (cinco centésimos por cento) e à alíquota municipal de 0,05% (cinco centésimos por cento)."

Pontos para o validador conferir:

- O art. 344, parágrafo único, diz que essas alíquotas são aplicadas com a redução dos regimes
  diferenciados e, nos combustíveis do regime específico (arts. 172 a 180), sobre o valor da
  operação no momento da incidência da CBS. A linha grava só a alíquota nominal.
- Foi conferido no HTML do Planalto que o caput dos arts. 343, 344, 346 e 347 não está tachado
  (não revogado); o art. 344 tem só o inciso IV do parágrafo único incluído pela LC nº 227/2026.

## Lacunas (sem linha)

1. CBS 2027-2028: alíquota de referência ainda não fixada por resolução do Senado (TCU calculou
   11,3%, que não está vigente); sem lei específica da União localizada.
2. Imposto Seletivo: MP nº 1.399/2026 fixa alíquotas por produto, com efeitos a partir de
   2027-02-02; não cabe como alíquota única no conjunto e ainda não foi convertida em lei.
3. IBS por UF/município em 2027-2028: não existe (a alíquota é uniforme pela lei).
4. IBS, CBS e IS de 2029 em diante: dependem de resoluções do Senado/leis ainda não publicadas.
5. Redutor de compras governamentais: não é alíquota deste formato; sem resolução publicada.

Detalhes e buscas feitas: `dados/premissas/README.md`, seção "Lacunas".
