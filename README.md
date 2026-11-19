# Planejador da Reforma Tributária

Simulador e planejador **local** de **CBS, IBS e Imposto Seletivo** (reforma tributária do consumo, LC 214/2025), construído sobre as **calculadoras oficiais da Receita Federal** publicadas como código aberto.

Você cadastra uma empresa, informa uma operação (itens, valores, UF e município) e vê o que a calculadora oficial devolve: tributos por item, memória de cálculo e base legal. Tudo roda no seu computador, sem nuvem e sem login.

> **Projeto independente.** Não tem vínculo com a Receita Federal nem com nenhum órgão público. É uma ferramenta de **simulação e planejamento**: **não substitui a apuração dos tributos**, não emite nota fiscal e não calcula imposto devido. Confira sempre com um contador.

## O que ele faz hoje (Fase 1)

- **Simulador de operação**: CBS, IBS (estadual e municipal) e IS por item, com memória de cálculo e fundamentação legal. Quem calcula é o motor oficial; o sistema não inventa fórmulas.
- **Empresas e cenários**: cadastro de empresas e cenários salvos com **resultado congelado**, versões e recálculo. Ao reabrir um cenário, ele mostra o resultado como foi gravado, sem consultar o motor.
- **Premissas de alíquota com fonte**: cada alíquota guarda norma, artigo e data da consulta. Um conjunto de premissas **validado fica imutável** (para alterar, duplique). A tela distingue o que é *oficial*, *lei de transição* e *premissa sua*.
- **Interface em React** com tema claro e escuro, pensada para uso no computador e no celular.

### O que ele ainda não faz

- **Não compara regimes** (Simples × Presumido × Real) nem calcula a alíquota efetiva do Simples. O motor do Simples Nacional é instalado, mas **só a versão dele é consultada**; empresas do Simples são calculadas pelo motor do regime regular e a tela avisa que isso não representa a apuração do Simples.
- **Não lê XML de notas**, não gera relatório em PDF e não tem assistente de IA. Veja o [roteiro](#roteiro).
- **CBS de 2027 não está carregada**, porque o Senado ainda não fixou a alíquota de referência (situação em 18/11/2026). Você pode cadastrar a sua própria premissa, marcada como "premissa sua".

## Princípio de fidelidade

> Quando uma regra não pode ser confirmada em fonte oficial, o sistema **recusa** em vez de chutar.

- Nenhum número entra sem fonte: linhas "oficial" e "lei de transição" exigem norma, artigo e data da consulta.
- Sem premissa para a consulta, o sistema devolve erro (`PREMISSA_AUSENTE`); nunca assume um valor padrão.
- Valores e alíquotas são tratados como **texto decimal**, nunca como número de ponto flutuante.
- Os dados oficiais carregados estão em [`dados/premissas/`](dados/premissas/) (hoje, 2 linhas de IBS da LC 214/2025, art. 344), com as fontes listadas em [`PARA-VALIDACAO.md`](dados/premissas/PARA-VALIDACAO.md). **Nenhuma linha foi validada por um humano ainda**: peça a um contador que valide antes de depender delas.

## Como funciona

```
Navegador ──►  App local (Node + Fastify + SQLite)  :3000
                  ├──►  Motor oficial, regime regular  :8080   (Java, Receita Federal)
                  └──►  Motor oficial, Simples Nacional :8082   (Java, só consulta de versão)
```

- O servidor do app e os dois motores escutam **somente em `127.0.0.1`** e não ficam acessíveis pela rede.
- O servidor recusa pedidos de outros sites (verificação de `Host` e `Origin`) e exige `application/json` nas escritas.
- Os dados ficam num arquivo SQLite local, `app/server/data/reforma.db`. O backup é copiar esse arquivo com o app parado.

**Tecnologias:** Node 22 e TypeScript, Fastify 5, better-sqlite3, React 18 + Vite, Vitest; motores oficiais em Java 21.

## Como instalar e usar (Windows)

**Pré-requisitos:** Git, JDK 21 e Node.js 22 ou mais novo.

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
winget install OpenJS.NodeJS.LTS
```

**1. Baixe os motores oficiais.** Eles não fazem parte deste repositório (são projetos separados da Receita Federal). Na pasta do projeto, e depois fixe os commits registrados em [`motores/VERSOES.md`](motores/VERSOES.md):

```powershell
git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git motores/regime-regular
git clone https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional.git motores/simples-nacional
git -C motores/regime-regular checkout <commit do regime regular>
git -C motores/simples-nacional checkout <commit do Simples Nacional>
```

**2. Inicie.** Dê dois cliques em `scripts/iniciar.bat` (ou rode `./scripts/iniciar.bat` no PowerShell). Na primeira vez ele instala as dependências, gera o banco dos motores e compila tudo, o que pode levar alguns minutos. Quando aparecer "Tudo no ar", o navegador abre em `http://127.0.0.1:3000`.

**3. Encerre** com `scripts/parar.bat`.

O guia completo, com o roteiro de verificação passo a passo, o significado dos selos, o backup e a atualização dos motores, está em [`docs/uso-local.md`](docs/uso-local.md).

## Desenvolvimento

```powershell
npm install
npm start                # servidor do app (precisa dos motores no ar)
npm test                 # testes do servidor e da interface
npm run test:integracao  # testes contra os motores reais (suba os motores antes)
npm run build            # constrói a interface
npm run typecheck
```

```
app/server/   API e regras (Fastify, SQLite, adaptadores dos motores)
app/web/      interface React (design system em src/estilos)
dados/        premissas oficiais com fonte, e como validá-las
docs/         guia de uso, spec e plano de implementação
scripts/      launcher do Windows (motores, app, parar)
motores/      só o registro de versões; os motores ficam em clones ignorados pelo git
```

A especificação de design e o plano da Fase 1 estão em [`docs/superpowers/`](docs/superpowers/).

## Roteiro

<a id="roteiro"></a>

Planejado, **ainda não disponível**:

- **Fase 2, dados reais:** leitura de XML de NF-e e NFS-e, mapa de créditos, simulador de repasse de preço e o congelamento do texto da base legal dentro de cada cenário.
- **Fase 3, planejamento:** módulos próprios de Presumido, Real e Simples (com fonte em cada regra), comparador de regimes para 2027, linha do tempo da transição 2026 a 2033 e relatório em PDF.
- **Fase 4, complementos:** assistente de IA que apenas explica resultados (nunca calcula) e geração de DANFSe.

## Créditos

O cálculo é feito pelas calculadoras de código aberto da Receita Federal (licença MIT):

- [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)
- [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional)

Este projeto as usa **sem modificá-las**. Parte do desenvolvimento foi feita com apoio de IA.

## Licença

Ainda não definida. Até que um arquivo de licença seja adicionado, aplicam-se os direitos autorais padrão: ninguém pode reutilizar este código sem autorização do autor.
