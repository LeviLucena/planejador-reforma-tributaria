# Fase 1 — Base e Cálculo Oficial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um app web local que simula operações (CBS/IBS/IS) usando só o motor oficial da Receita e guarda empresas, cenários e premissas de alíquota com fonte.

**Architecture:** Dois motores Java oficiais (regime regular :8080, Simples :8082) rodam como `java -jar` locais, tratados como componentes externos somente leitura. Um back-end Fastify (:3000) os acessa por adaptadores tipados, mantém um SQLite próprio (empresas, cenários, premissas) e serve a interface React.

**Tech Stack:** Node 22, TypeScript, Fastify, better-sqlite3, vitest, React + Vite, JDK Temurin 21 (já instalado), PowerShell/`.bat` para o launcher.

**Spec:** `docs/superpowers/specs/2026-11-18-reforma-tributaria-design.md` (Fases 2, 3 e 4 terão planos próprios).

## Global Constraints

- Windows 11, **sem Docker**; Java 21 e Node 22; tudo local, sem nuvem, sem login (M8).
- Interface e código de domínio em **português do Brasil** (M1).
- Motores oficiais **nunca editados**; acesso só por HTTP em `localhost` via adaptador (M3, M4).
- Versão dos motores fixada por commit exato em `motores/VERSOES.md` (M9).
- Cenário guarda **entradas, resultado congelado, versão do motor, versão das premissas**; recalcular gera nova versão (M10).
- **Nenhum número sem fonte** (U2, §9.1): premissa com origem `oficial` ou `lei_transicao` exige norma e artigo; sem premissa para a consulta, o sistema **recusa** (`PREMISSA_AUSENTE`), nunca assume padrão.
- Divergência com o motor oficial é bug nosso: para IBS/CBS/IS o resultado do motor prevalece.
- Toda tela de resultado traz "simulação, não substitui apuração" (M6).
- Valores monetários e alíquotas trafegam como **string decimal**, nunca `float` (preserva "56.76").
- Testes de integração rodam contra o **motor real**; fixtures são respostas reais do motor (ex.: `motores/resp.json`), nunca dados inventados.
- Commits só quando o usuário autorizar; os passos "Commit" abaixo ficam pendentes até então.

## Review Focus

1. Motor desligado ou fora do ar quando o app chama → erro claro "motor indisponível" (HTTP 503), sem derrubar o servidor (Task 4, 9).
2. Operação com item inválido (`REG-011`) → os demais itens calculam, o item com erro é salvo e reaberto como veio (Task 9, 10).
3. Premissa ausente para UF/município/data → `PREMISSA_AUSENTE`, jamais um valor padrão (Task 7, 9).
4. Precisão decimal e acentos: "56.76" sem arredondamento de ponto flutuante; memória de cálculo com acentos preservada ao salvar e reabrir (Task 4, 10).
5. Entrada ruim: operação sem itens, `uf` inválida, data fora de vigência, JSON malformado → 400 com mensagem, nunca 500 (Task 9).

---

## Estrutura de arquivos

```
reforma-tributaria/
  .gitignore                      ignora motores/*/ (repos externos), node_modules, dist, *.log, *.db
  package.json                    workspaces: app/server, app/web
  motores/VERSOES.md              commits fixados dos motores (já existem os clones)
  scripts/iniciar-motores.ps1     sobe/derruba os dois JARs
  scripts/iniciar.bat             sobe motores + app e abre o navegador
  dados/premissas/                arquivos JSON de premissas com fonte (Task 8)
  app/server/src/
    dominio/tipos.ts              tipos compartilhados (Task 4)
    motores/regimeRegular.ts      adaptador :8080
    motores/simplesNacional.ts    adaptador :8082
    db/banco.ts, db/migracoes/    SQLite do app
    premissas/repositorio.ts, premissas/resolver.ts, premissas/carregador.ts
    simulacao/servico.ts
    empresas/repositorio.ts, cenarios/repositorio.ts
    rotas/*.ts, app.ts, index.ts
  app/web/src/                    React: layout, simulador, empresas, cenários, premissas
```

---

### Task 1: Repositório, workspaces e versões dos motores

**Files:**
- Create: `.gitignore`, `package.json`, `motores/VERSOES.md`, `app/server/package.json`, `app/server/tsconfig.json`, `app/server/vitest.config.ts`, `app/server/vitest.integracao.config.ts`
- Test: `app/server/src/sanidade.test.ts`

**Interfaces:**
- Produces: scripts npm `test` (unitários, `*.test.ts`) e `test:integracao` (`*.int.test.ts`, exige motores no ar) no workspace `app/server`.

- [ ] **Step 1: Write the failing test** — `sanidade.test.ts` com `expect(1 + 1).toBe(2)`; serve para provar que o runner está ligado.
- [ ] **Step 2: Run** `npm -w app/server test` → FAIL (sem workspace/vitest).
- [ ] **Step 3: Criar** `git init`, `.gitignore`, workspaces e dependências (`fastify`, `better-sqlite3`, `typescript`, `vitest`, `tsx`); `vitest.integracao.config.ts` inclui só `**/*.int.test.ts`.
- [ ] **Step 4: Registrar versões** em `motores/VERSOES.md`: saída de `git -C motores/regime-regular rev-parse HEAD` e `git -C motores/simples-nacional rev-parse HEAD`, data, e `versaoApp`/`versaoDb` lidas de `GET /api/versao` (:8082).
- [ ] **Step 5: Run** `npm -w app/server test` → PASS.
- [ ] **Step 6: Commit** `chore: estrutura do repositório e versões dos motores`

### Task 2: Launcher dos motores

**Files:**
- Create: `scripts/iniciar-motores.ps1`
- Test: verificação por comando (script de infraestrutura).

**Interfaces:**
- Produces: `iniciar-motores.ps1 [-Parar]` — localiza o JDK 21 (`C:\Program Files\Eclipse Adoptium\jdk-21*`), garante `calculadora/db/calculadora-pro.db` (gera via `mvnw.cmd flyway:migrate -Dflyway.configFiles=flyway\flyway-pro.conf` e copia para `simples-nacional`), compila JAR se faltar (`mvnw.cmd clean package -DskipTests`), sobe `api-regime-geral.jar` (:8080) e `api-simples-nacional.jar` (`-Dserver.port=8082`) com `-Dspring.profiles.active=offline`, `WorkingDirectory` na raiz de cada motor, e espera `GET /api/swagger-ui.html` (:8080) e `GET /api/versao` (:8082) responderem 200 (limite 120 s). Idempotente: se a porta já responde, não sobe de novo. `-Parar` encerra só os processos que ele iniciou.

- [ ] **Step 1: Implementar** conforme a assinatura acima.
- [ ] **Step 2: Verify** parar os motores atuais, rodar `powershell -File scripts/iniciar-motores.ps1`; Expected: imprime "regime-regular OK" e "simples-nacional OK" e `curl http://localhost:8082/api/versao` retorna `ambiente":"offline"`.
- [ ] **Step 3: Verify idempotência**: rodar de novo; Expected: não cria segundo processo `java`; imprime "já em execução".
- [ ] **Step 4: Verify `-Parar`**: Expected: portas 8080 e 8082 deixam de responder.
- [ ] **Step 5: Commit** `feat: launcher dos motores oficiais`

### Task 3: Esqueleto do servidor

**Files:**
- Create: `app/server/src/app.ts`, `app/server/src/index.ts`, `app/server/src/config.ts`, `app/server/src/rotas/saude.ts`
- Test: `app/server/src/rotas/saude.test.ts`

**Interfaces:**
- Produces: `buildApp(opcoes?: { motores?: MotoresPort; banco?: Banco }): FastifyInstance`; `config`: `{ portaApp: 3000, urlRegimeRegular: "http://localhost:8080/api/calculadora", urlSimples: "http://localhost:8082/api", caminhoBanco: string }` (sobrescrevíveis por variável de ambiente).

- [ ] **Step 1: Write the failing test** — `GET /api/saude` via `app.inject` retorna 200 e `{ status: "ok" }`.
- [ ] **Step 2: Run** `npm -w app/server test -- saude` → FAIL.
- [ ] **Step 3: Implement** `buildApp` com a rota de saúde, handler de erro que converte `ErroDominio` (com `codigo` e `status`) em JSON `{ codigo, mensagem }` e erro desconhecido em 500 genérico.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: esqueleto do servidor`

### Task 4: Tipos de domínio e adaptador do motor regular

**Files:**
- Create: `app/server/src/dominio/tipos.ts`, `app/server/src/dominio/erros.ts`, `app/server/src/motores/regimeRegular.ts`, `app/server/test/fixtures/resposta-oficial.json` (cópia **byte a byte** de `motores/resp.json`), `app/server/test/fixtures/operacao-oficial.json` (cópia de `motores/teste-operacao.json`)
- Test: `app/server/src/motores/regimeRegular.test.ts`, `app/server/src/motores/regimeRegular.int.test.ts`

**Interfaces:**
- Produces (`tipos.ts`): `AliquotasNominais { cbs: string; ibsEstadual: string; ibsMunicipal: string; impostoSeletivo?: { adValorem?: string; adRem?: string } }`; `ItemEntrada { numero: number; ncm?: string; nbs?: string; cst: string; cClassTrib: string; baseCalculo?: string; quantidade?: string; unidade?: string; impostoSeletivo?: {...}; aliquotasNominais?: AliquotasNominais }`; `OperacaoEntrada { id: string; versao: string; dhFatoGerador: string; municipio: number; uf: string; itens: ItemEntrada[] }`; `ObjetoResultado { nObj: number; estadoItem: "CALCULO_SIMULADO" | "INCONSISTENCIA_ENTRADA" | string; erros?: { code: string; title: string; pointer: string; detail: string }[]; tribCalc?: unknown }`; `ResultadoOperacao { objetos: ObjetoResultado[]; total: unknown }`.
- Produces (`erros.ts`): `class ErroDominio extends Error { codigo: string; status: number }`; códigos usados: `MOTOR_INDISPONIVEL` (503), `ENTRADA_INVALIDA` (400), `PREMISSA_AUSENTE` (422).
- Produces (`regimeRegular.ts`): `interface MotoresPort { calcularOperacao(op: OperacaoEntrada): Promise<ResultadoOperacao>; versoes(): Promise<{ regimeRegular: string; simples: { app: string; db: string } }>; listarSituacoes(data: string): Promise<SituacaoTributaria[]>; listarFundamentacoes(data: string): Promise<Fundamentacao[]> }` e `criarMotores(cfg): MotoresPort` (usa `fetch`, lê corpo como UTF-8, nunca `Number()` em valores monetários).

- [ ] **Step 1: Write the failing unit test** — `parseResultado(fixture)` extrai: total `vCBS === "56.76"`, `vIBS === "0.64"`, `vIS === "15.00"`; objeto 4 com `estadoItem === "INCONSISTENCIA_ENTRADA"` e `erros[0].code === "REG-011"`; `memoriaCalculo` do item 3 contém a palavra "Art." e acentos intactos (ex.: o texto contém "Operação").
- [ ] **Step 2: Write the failing unit test de indisponibilidade** — com `fetch` apontado para porta fechada, `calcularOperacao` rejeita com `ErroDominio` de `codigo === "MOTOR_INDISPONIVEL"`.
- [ ] **Step 3: Write the failing integration test** (`.int.test.ts`, motor real no ar) — `calcularOperacao(operacao-oficial)` devolve os mesmos totais do passo 1.
- [ ] **Step 4: Run** `npm -w app/server test -- regimeRegular` → FAIL.
- [ ] **Step 5: Implement** tipos, erros e `criarMotores`; `calcularOperacao` faz `POST {urlRegimeRegular}/observabilidade/regime-geral`, tratando resposta 4xx do motor como `ENTRADA_INVALIDA` com o `detail` dele; `listarSituacoes` usa `GET dados-abertos/situacoes-tributarias/cbs-ibs?data=`; `listarFundamentacoes` usa `GET dados-abertos/fundamentacoes-legais?data=`.
- [ ] **Step 6: Run** unitários → PASS; `npm -w app/server run test:integracao -- regimeRegular` (motores no ar) → PASS.
- [ ] **Step 7: Commit** `feat: adaptador do motor regular com tipos de domínio`

### Task 5: Adaptador do motor do Simples

**Files:**
- Create: `app/server/src/motores/simplesNacional.ts`
- Modify: `app/server/src/motores/regimeRegular.ts` (`versoes()` passa a consultar também `GET /api/versao` do Simples)
- Test: `app/server/src/motores/simplesNacional.int.test.ts`

**Interfaces:**
- Produces: `listarAtividades(data: string): Promise<AtividadeSimples[]>` com `AtividadeSimples { codigo: string; descricao: string; anexoSemFatorR: string; anexoComFatorR: string | null; sujeitaFatorR: boolean; disponivel: boolean }` (campos reais da resposta de `GET /calculadora/simples-nacional/atividades?data=`).

- [ ] **Step 1: Write the failing integration test** — para `2027-03-10`, a lista tem 15 atividades; a de `codigo "01"` tem `anexoSemFatorR === "I"` e `descricao` começando com "Revenda de mercadorias".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** o adaptador e o ajuste de `versoes()`.
- [ ] **Step 4: Run** `npm -w app/server run test:integracao -- simplesNacional` → PASS.
- [ ] **Step 5: Commit** `feat: adaptador do motor do Simples`

### Task 6: Banco do app, migrações e regra de fonte

**Files:**
- Create: `app/server/src/db/banco.ts`, `app/server/src/db/migracoes/001_inicial.sql`
- Test: `app/server/src/db/banco.test.ts`

**Interfaces:**
- Produces: `abrirBanco(caminho: string): Banco` (`":memory:"` aceito; aplica migrações pendentes em ordem, registra em `migracoes`); tabelas: `empresa(id, razao_social, cnpj, regime_atual, uf, municipio_ibge, criado_em, atualizado_em)`, `conjunto_premissas(id, nome, vigencia_inicio, observacao, validado_por, validado_em)`, `premissa_aliquota(id, conjunto_id, tributo CHECK IN ('CBS','IBS_UF','IBS_MUN','IS_ADVALOREM','IS_ADREM'), uf, municipio_ibge, aliquota TEXT, origem CHECK IN ('oficial','lei_transicao','usuario'), fonte_norma, fonte_artigo, consultado_em)`, `cenario(id, empresa_id, nome, versao_numero, entrada_json, resultado_json, versao_motor, conjunto_premissas_id, criado_em)`.
- Constraint obrigatória: `CHECK (origem = 'usuario' OR (fonte_norma IS NOT NULL AND fonte_norma <> '' AND fonte_artigo IS NOT NULL AND fonte_artigo <> '' AND consultado_em IS NOT NULL))`.

- [ ] **Step 1: Write the failing tests** — (a) inserir premissa `origem='oficial'` sem `fonte_norma` lança erro de constraint; (b) com fonte completa, insere; (c) `origem='usuario'` sem fonte, insere; (d) abrir o mesmo arquivo duas vezes não reaplica migração.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `abrirBanco` com `better-sqlite3`, `PRAGMA foreign_keys=ON` e o SQL acima.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: banco do app com regra de fonte obrigatória`

### Task 7: Premissas — repositório e resolvedor

**Files:**
- Create: `app/server/src/premissas/repositorio.ts`, `app/server/src/premissas/resolver.ts`
- Test: `app/server/src/premissas/resolver.test.ts`

**Interfaces:**
- Consumes: `Banco` (Task 6), `AliquotasNominais`, `ErroDominio` (Task 4).
- Produces: `criarConjunto(banco, { nome, vigenciaInicio, observacao? }): number`; `adicionarPremissa(banco, conjuntoId, p: PremissaEntrada): number`; `resolverAliquotas(banco, conjuntoId: number, uf: string, municipioIbge: number, data: string): { aliquotas: AliquotasNominais; origens: Record<string, "oficial"|"lei_transicao"|"usuario"> }`. Procura primeiro premissa específica de município/UF e depois a nacional (`uf` e município nulos); se `CBS`, `IBS_UF` ou `IBS_MUN` não existir para a combinação, lança `ErroDominio("PREMISSA_AUSENTE")` citando o tributo faltante; se `data` < `vigencia_inicio` do conjunto, também `PREMISSA_AUSENTE`.

- [ ] **Step 1: Write the failing tests** — (a) conjunto completo (CBS nacional, IBS_UF de SP, IBS_MUN de São Paulo 3550308) resolve para `uf="SP"`, `municipio=3550308` com `origens.CBS === "usuario"` quando assim cadastrado; (b) sem `IBS_MUN` → `PREMISSA_AUSENTE` mencionando "IBS_MUN"; (c) premissa de município vence a da UF; (d) data anterior à vigência → `PREMISSA_AUSENTE`; (e) alíquotas voltam como string exatamente como gravadas ("8.8" não vira "8.80000001").
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** repositório e resolvedor (consultas SQL parametrizadas).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: premissas de alíquota com resolvedor que recusa lacunas`

### Task 8: Levantamento oficial das alíquotas de 2027 em diante

**Files:**
- Create: `dados/premissas/README.md`, `dados/premissas/schema.json`, `app/server/src/premissas/carregador.ts`, `app/server/src/premissas/carregador.test.ts`; arquivos de dados `dados/premissas/*.json` (gerados na execução desta task)

**Interfaces:**
- Consumes: `adicionarPremissa` (Task 7).
- Produces: `carregarArquivo(banco, caminho: string): { conjuntoId: number; linhas: number }` — valida cada linha contra `schema.json` e **rejeita o arquivo inteiro** se qualquer linha `oficial`/`lei_transicao` não tiver `fonte_norma`, `fonte_artigo` e `consultado_em`; `validado_por` nasce nulo. Script npm `premissas:carregar -- <arquivo>`.

- [ ] **Step 1: Write the failing tests** — arquivo com linha sem `fonte_artigo` é rejeitado e **nada** é gravado; arquivo de teste válido grava N linhas (arquivo de teste com `origem:"usuario"`, que não finge ser oficial).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** carregador e `schema.json`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Pesquisa (tarefa de dados, não de código)** — levantar nas fontes oficiais (texto da LC 214/2025, EC 132/2023, resoluções do Senado, publicações da Receita/Comitê Gestor) as alíquotas e fases de 2027 em diante que **existirem publicadas**; gravar em `dados/premissas/2027-oficial.json` apenas o que tiver norma, artigo e data da consulta, e listar em `dados/premissas/README.md` o que **não foi encontrado** como lacuna. Valores não localizados ficam ausentes (o resolvedor recusa); não preencher por estimativa.
- [ ] **Step 6: Entregar ao usuário** a lista linha a linha com fonte para validação (`validado_por`/`validado_em` só são preenchidos por ele).
- [ ] **Step 7: Commit** `feat: carregador de premissas e dados oficiais de 2027 (pendentes de validação)`

### Task 9: Serviço e rota de simulação

**Files:**
- Create: `app/server/src/simulacao/servico.ts`, `app/server/src/rotas/simulacao.ts`
- Test: `app/server/src/simulacao/servico.test.ts`, `app/server/src/rotas/simulacao.test.ts`, `app/server/src/simulacao/servico.int.test.ts`

**Interfaces:**
- Consumes: `MotoresPort.calcularOperacao` (Task 4), `resolverAliquotas` (Task 7).
- Produces: `simularOperacao(deps: { motores: MotoresPort; banco: Banco }, req: { operacao: OperacaoEntrada; conjuntoPremissasId: number }): Promise<{ resultado: ResultadoOperacao; entradaEnviada: OperacaoEntrada; origensPremissas: Record<string,string> }>`; preenche `aliquotasNominais` dos itens que não trouxerem as suas (alíquota do item prevalece). Rota `POST /api/simular` com corpo `{ operacao, conjuntoPremissasId }`; valida: `itens` não vazio, `uf` de 2 letras válida, `municipio` inteiro de 7 dígitos, `dhFatoGerador` ISO-8601, `cst` com 3 dígitos, `cClassTrib` com 6 dígitos; resposta 400 com `{ codigo: "ENTRADA_INVALIDA", mensagem }`.

- [ ] **Step 1: Write the failing tests (unitários, com `MotoresPort` fake somente para isolar a rede)** — (a) item sem alíquota recebe a do conjunto; item com alíquota própria mantém a dele; (b) conjunto sem `IBS_MUN` → `PREMISSA_AUSENTE` e o motor **não** é chamado; (c) `MOTOR_INDISPONIVEL` propaga como 503; (d) rota: corpo com `itens: []` → 400; `uf: "XX"` → 400; JSON malformado → 400.
- [ ] **Step 2: Write the failing integration test** (motor real) — conjunto de premissas `usuario` com CBS `8.8`, IBS_UF `0.05`, IBS_MUN `0.05` para RS/4314902 e operação oficial sem alíquotas nos itens → totais `56.76`, `0.64`, `15.00`; item 4 com `REG-011` e itens 1–3 calculados.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** serviço e rota.
- [ ] **Step 5: Run** unitários e `npm -w app/server run test:integracao -- servico` → PASS.
- [ ] **Step 6: Commit** `feat: simulação de operação com premissas`

### Task 10: Empresas e cenários

**Files:**
- Create: `app/server/src/empresas/repositorio.ts`, `app/server/src/cenarios/repositorio.ts`, `app/server/src/rotas/empresas.ts`, `app/server/src/rotas/cenarios.ts`
- Test: `app/server/src/empresas/repositorio.test.ts`, `app/server/src/cenarios/repositorio.test.ts`, `app/server/src/rotas/cenarios.test.ts`

**Interfaces:**
- Consumes: `simularOperacao` (Task 9), `MotoresPort.versoes` (Task 4).
- Produces: `criarEmpresa`, `listarEmpresas`, `obterEmpresa`, `atualizarEmpresa`, `excluirEmpresa` (CNPJ validado com dígitos verificadores; `regime_atual` ∈ `simples|presumido|real`); `salvarCenario(deps, { empresaId, nome, operacao, conjuntoPremissasId }): Promise<Cenario>` — simula, grava `entrada_json`, `resultado_json`, `versao_motor` (texto com commits/versões de `versoes()`), `conjunto_premissas_id`, `versao_numero = 1`; `reabrirCenario(id): Cenario` devolve o **resultado gravado, sem chamar o motor**; `recalcularCenario(deps, id): Promise<Cenario>` cria nova linha com `versao_numero + 1` e preserva as anteriores. Rotas REST sob `/api/empresas` e `/api/empresas/:id/cenarios`, `POST /api/cenarios/:id/recalcular`.

- [ ] **Step 1: Write the failing tests** — (a) CNPJ inválido → 400; (b) `salvarCenario` + `reabrirCenario` devolvem JSON de resultado **idêntico** ao original (comparação profunda), inclusive o item `REG-011` e a memória de cálculo com acentos; (c) `reabrirCenario` com motor derrubado continua funcionando (não depende do motor); (d) `recalcularCenario` cria versão 2 e a versão 1 permanece inalterada; (e) excluir empresa apaga seus cenários (`ON DELETE CASCADE`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** repositórios e rotas.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: empresas e cenários com resultado congelado`

### Task 11: Interface — esqueleto, cliente da API e aviso

**Files:**
- Create: `app/web/package.json`, `app/web/vite.config.ts`, `app/web/src/main.tsx`, `app/web/src/App.tsx`, `app/web/src/api/cliente.ts`, `app/web/src/componentes/AvisoSimulacao.tsx`
- Modify: `app/server/src/app.ts` (serve `app/web/dist` em produção, `/api` continua da API)
- Test: `app/web/src/componentes/AvisoSimulacao.test.tsx`, `app/web/src/api/cliente.test.ts`

**Interfaces:**
- Produces: `cliente.simular(req)`, `cliente.empresas.*`, `cliente.cenarios.*`, `cliente.premissas.*` (um método por rota da API, tipados com os tipos do servidor); `<AvisoSimulacao />` com o texto exato "Simulação — não substitui a apuração dos tributos." renderizado em todas as páginas pelo layout; navegação: Simulador, Empresas, Premissas.

- [ ] **Step 1: Write the failing tests** — `AvisoSimulacao` renderiza o texto exato; `cliente.simular` envia `POST /api/simular` e, em resposta `{ codigo: "MOTOR_INDISPONIVEL" }`, lança erro com essa `codigo`.
- [ ] **Step 2: Run** `npm -w app/web test` → FAIL.
- [ ] **Step 3: Implement** o esqueleto Vite/React, o layout e o cliente.
- [ ] **Step 4: Run** → PASS; `npm -w app/web run build` gera `app/web/dist`.
- [ ] **Step 5: Commit** `feat: esqueleto da interface`

### Task 12: Interface — Simulador de operação

**Files:**
- Create: `app/web/src/paginas/Simulador.tsx`, `app/web/src/componentes/TabelaItens.tsx`, `app/web/src/componentes/ResultadoOperacao.tsx`
- Test: `app/web/src/paginas/Simulador.test.tsx`

**Interfaces:**
- Consumes: `cliente.simular`; `GET /api/classificacoes?data=` e `GET /api/fundamentacoes?data=` (novas rotas finas do servidor sobre `listarSituacoes`/`listarFundamentacoes`, a criar nesta task em `rotas/consultas.ts` com teste de integração).

- [ ] **Step 1: Write the failing tests** — (a) formulário com UF, município, data/hora e itens (NCM ou NBS, CST, cClassTrib, base, quantidade, unidade) e a lista de CST/cClassTrib vinda da API; (b) com a resposta da fixture oficial, a tela mostra por item `estadoItem`, CBS, IBS, e para o item 4 a mensagem do `REG-011` **sem esconder os itens calculados**; (c) mostra os totais `56.76`, `0.64`, `15.00`; (d) cada item expandível mostra `memoriaCalculo` e a fundamentação legal do `cClassTrib`; (e) `PREMISSA_AUSENTE` mostra qual tributo falta e **não** mostra totais; (f) `MOTOR_INDISPONIVEL` mostra como iniciar os motores.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a página e as rotas finas.
- [ ] **Step 4: Run** `npm -w app/web test` e `npm -w app/server test` → PASS.
- [ ] **Step 5: Commit** `feat: simulador de operação`

### Task 13: Interface — Empresas, cenários e premissas

**Files:**
- Create: `app/web/src/paginas/Empresas.tsx`, `app/web/src/paginas/EmpresaDetalhe.tsx`, `app/web/src/paginas/Premissas.tsx`, `app/server/src/rotas/premissas.ts`
- Test: `app/web/src/paginas/EmpresaDetalhe.test.tsx`, `app/web/src/paginas/Premissas.test.tsx`, `app/server/src/rotas/premissas.test.ts`

**Interfaces:**
- Produces: rotas `GET/POST /api/premissas/conjuntos`, `GET/POST /api/premissas/conjuntos/:id/linhas`, `POST /api/premissas/carregar` (aceita arquivo da Task 8), `POST /api/premissas/conjuntos/:id/validar` (preenche `validado_por`/`validado_em`, ação explícita do usuário).

- [ ] **Step 1: Write the failing tests** — (a) cadastrar empresa e listar; (b) salvar cenário a partir do simulador, reabrir e ver o resultado idêntico com o selo da versão do motor e das premissas; (c) botão "Recalcular" cria versão 2 e mantém a lista de versões; (d) página de premissas mostra cada linha com **selo de origem** (oficial / lei de transição / premissa sua) e fonte; linha oficial sem fonte não pode ser criada pela rota (400); conjunto não validado exibe "pendente de validação"; (e) rota `validar` exige corpo com `validadoPor` não vazio.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** páginas e rotas.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: empresas, cenários e premissas na interface`

### Task 14: Launcher completo e verificação final da Fase 1

**Files:**
- Create: `scripts/iniciar.bat`, `docs/uso-local.md`

**Interfaces:**
- Produces: `iniciar.bat` — chama `iniciar-motores.ps1`, roda `npm -w app/web run build` se `dist` não existir, inicia o servidor (:3000) e abre `http://localhost:3000` no navegador; `docs/uso-local.md` explica instalação do JDK 21, primeiro uso, atualização dos motores (`git pull` + regenerar banco + recompilar + atualizar `VERSOES.md`) e o significado dos selos.

- [ ] **Step 1: Verify launcher** — com tudo parado, executar `scripts\iniciar.bat`; Expected: navegador abre em `http://localhost:3000` e `GET /api/saude` responde `ok`.
- [ ] **Step 2: Verify critério de pronto (spec §9, Fase 1)** — `npm -w app/server run test:integracao` e `npm test` em ambos os workspaces; Expected: todos PASS, incluindo os totais `56.76`, `0.64`, `15.00`.
- [ ] **Step 3: Verify manual pelo usuário no Chrome** (não automatizar): cadastrar empresa, simular a operação oficial com premissas `usuario` (CBS 8.8, IBS 0.05 e 0.05), salvar o cenário, fechar e reabrir o app e ver o cenário idêntico; derrubar o motor e confirmar a mensagem "motor indisponível" com o cenário salvo ainda abrindo.
- [ ] **Step 4: Commit** `feat: launcher completo e documentação de uso`

---

## Self-review

- **Cobertura da spec (Fase 1):** O1 → Tasks 4, 9, 12; O2 → Tasks 6, 10, 13; restrição das alíquotas de 2027 ausentes → Tasks 7, 8; M3/M4 → Task 4/5; M5 → Tasks 6, 8; M6 → Tasks 11, 12; M7 → Task 6; M8 (sem login) → ausência intencional; M9 → Task 1; M10 → Task 10; §9.1 (sem fonte, recusar, premissas ≠ fatos) → Tasks 6, 7, 8, 13. Fases 2–4 ficam em planos próprios.
- **Consistência de tipos:** `MotoresPort`, `OperacaoEntrada`, `ResultadoOperacao`, `ErroDominio` e `resolverAliquotas` têm a mesma assinatura em todas as tasks que as usam.
- **Proporção:** o plano descreve decisões, assinaturas e asserções, sem corpos de função.
