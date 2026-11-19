# Planejador da Reforma Tributária (IBS/CBS) — Design

Data: 18/11/2026 · Estado: rascunho para aprovação · Local: `Documents/Projetos/reforma-tributaria`

## 1. Intenção e motivo

Construir um sistema web que roda **somente na máquina do usuário** para fazer cálculos e planejamentos tributários de empresas para **2027 em diante**, usando como motor de IBS/CBS/IS as calculadoras oficiais que a Receita Federal publicou como código aberto (licença MIT):

- `calculadora-rtc-regime-regular` (Java 21, Spring Boot, SQLite) — cálculo por operação, dados abertos, XML.
- `calculadora-rtc-simples-nacional` (Java 21, Spring Boot, SQLite) — cálculo para optantes do Simples.
- `calculadora-rtc-gerador-danfse` (Go) — PDF do DANFSe. **Fora do escopo inicial.**

Quem escolhe regime, atividades, dados e cenários é o **usuário do sistema**; o sistema não decide por ele. O sistema é independente de qualquer outro produto do autor.

## 2. Objetivos

- O1. Simular uma operação (item a item) e mostrar CBS, IBS, IS, memória de cálculo e fundamentação legal, **usando só o motor oficial**.
- O2. Cadastrar empresas e manter vários cenários por empresa.
- O3. Comparar regimes (Simples × Presumido × Real) para 2027, mostrando carga total lado a lado.
- O4. Importar lotes de XML (NF-e/NFS-e), recalcular cada item e apontar inconsistências e créditos perdidos.
- O5. Mapear créditos de CBS/IBS conforme o regime do fornecedor.
- O6. Simular o repasse de preço necessário para manter a margem.
- O7. Gerar relatório em PDF do planejamento.
- O8. Mostrar a linha do tempo de transição 2026–2033.
- O9. (Opcional, por último) Assistente de IA que **apenas explica** resultados.

## 3. Não objetivos

- Não substitui apuração, PGDAS-D, nem sistemas de autorização de documentos fiscais.
- Não emite nota fiscal nem transmite dados à Receita.
- Sem hospedagem em nuvem, sem login e sem multiusuário nesta versão.
- Não reimplementa as regras de IBS/CBS/IS: isso é sempre do motor oficial.
- Gerador de DANFSe: **entra na Fase 4** (exige instalar Go), conforme U1.

## 4. Anti-objetivos (seria fracasso mesmo "funcionando")

- Mostrar número tributário sem fonte, ou de aparência oficial sem ser.
- Um erro de regra própria (Presumido, Real, anexos) passar despercebido e virar recomendação ao cliente.
- Dado de empresa sair da máquina do usuário.
- Quebrar ao atualizar o motor oficial.

## 5. Restrições

- Roda em Windows 11, sem Docker. Java 21 (JDK Temurin 21, já instalado) e Node 22.
- O motor regular precisa do banco SQLite gerado por Flyway (`calculadora-pro.db`, ~5,4 MB). O motor do Simples usa o **mesmo** banco (os scripts ficam só no repositório regular).
- As alíquotas de referência de 2027 **não estão no banco** (endpoints `aliquota-*` devolvem 404). O sistema precisa de tabela própria de cenários de alíquota e envia os valores ao motor em `aliquotasNominais`.
- O motor é por operação (entrada: itens com NCM/NBS, CST, cClassTrib, base, alíquotas), não por empresa.
- O motor do Simples **não calcula** a alíquota efetiva (RBT12/anexos): isso é do PGDAS-D, com integração só planejada para a Release 16.
- Os roadmaps da Receita preveem mudanças na Release 16 e em 2027; o contrato das APIs pode mudar.

## 6. Abordagens consideradas

- **A. Node + SQLite + interface React (escolhida).** Um `iniciar.bat` sobe os dois motores Java e o app. Módulos próprios em TypeScript. Trade-off: dois ambientes (Java e Node) rodando juntos.
- B. App todo em Java (Spring Boot). Uma linguagem, mas interface bem mais trabalhosa e ritmo menor.
- C. Python + Streamlit. Protótipo mais rápido, interface limitada, difícil virar produto.

Escolha do usuário: **A**.

## 7. Decisões do usuário

- Caminho A, em 3 fases (abaixo).
- Roda localmente; hospedagem fora de pauta.
- O usuário final decide regimes, dados e cenários.
- Sem relação com outros produtos do autor.
- U1. **Escopo máximo**: cobrir todas as possibilidades — todos os regimes (Simples, Presumido, Real), todos os anexos e atividades do Simples, NF-e e NFS-e, relatório, linha do tempo, IA e DANFSe. Nada é cortado; o que muda é a ordem.
- U2. **Fidelidade máxima, nada fictício**: nenhum valor, alíquota, regra ou exemplo inventado ou "de enfeite". Todo dado vem de fonte oficial verificável e traz a citação.
- U3. As alíquotas e regras de transição são **levantadas por mim** a partir das fontes oficiais, com fonte por linha, e **validadas pelo usuário ou por contador** antes de qualquer relatório (opção proposta na pergunta 2).
- U4. O usuário não indicou um perfil único de uso: o sistema atende **dono de empresa e consultor/contador**, e o relatório segue o padrão mais exigente (o de entrega a terceiros).
- U5. XMLs: suportar **NF-e e NFS-e**, com ou sem os campos da reforma. O usuário não informou se tem amostras reais; sem elas, os testes usam apenas XMLs de exemplo **oficiais** (leiautes e notas técnicas), nunca XMLs fabricados.

## 8. Decisões minhas (marcadas como proposta; corrija se discordar)

- M1. Linguagem da interface e do código de domínio: **português do Brasil**.
- M2. Back-end Node com **Fastify** e SQLite via **better-sqlite3**; interface **React + Vite**. Um só repositório com `motores/`, `app/server`, `app/web`.
- M3. Os motores Java são tratados como **componentes externos, só leitura**: nunca editamos o código deles. Atualizar = `git pull` + regenerar banco + recompilar, em um script.
- M4. O app fala com os motores só por HTTP em `localhost`, atrás de uma camada de adaptação própria (isola mudanças de contrato).
- M5. Toda **regra própria** (Presumido, Real, anexos do Simples, transição) fica em **tabelas de dados versionadas**, cada linha com **fonte legal e data de vigência**, e é testada contra casos de exemplo com resultado conhecido. Nenhum número entra sem fonte.
- M6. Todo relatório e toda tela de resultado trazem o aviso "simulação, não substitui apuração".
- M7. Dados ficam em um arquivo SQLite local do app (separado do banco dos motores). Exportar/importar o arquivo faz o backup.
- M8. Sem login nesta versão (uso pessoal local).
- M9. Versões dos motores fixadas por **commit exato**, registrado em `motores/VERSOES.md` na primeira tarefa da Fase 1. Os clones e o banco já existem em `motores/`.
- M10. Um cenário guarda **entradas, resultado congelado, versão do motor e versão das premissas**. Reabrir mostra o resultado original; "recalcular" é uma ação explícita que gera nova versão.
- M11. O9 (IA) fica por último e **desligado por padrão**. Nenhum dado de empresa sai da máquina sem aceite explícito do usuário naquele uso; a preferência é modelo local.

## 9. Fases

**Fase 1 — Base e cálculo oficial (O1, O2).**
Launcher dos motores, adaptador HTTP, simulador de operação, cadastro de empresas, cenários e tabela de premissas de alíquota (CBS, IBS UF/município, IS).
Pronto quando: o exemplo oficial da documentação reproduz CBS 56,76, IBS 0,64 e IS 15,00 pela interface; um cenário salvo reabre idêntico.

**Fase 2 — Dados reais (O4, O5, O6).**
Leitor de XML NF-e/NFS-e, reprocessamento por item com erros do motor (`REG-xxx`), mapa de créditos por regime do fornecedor, simulador de repasse de preço.
Pronto quando: um lote de XMLs reais gera relatório de inconsistências sem falhar em item inválido.

**Fase 3 — Planejamento (O3, O7, O8; depois O9).**
Módulos de Presumido, Real e Simples (anexos/RBT12), comparador, linha do tempo 2026–2033, PDF.
Pronto quando: cada módulo passa nos casos de exemplo com fonte e foi **revisado pelo usuário ou por contador** antes de gerar relatório.

**Fase 4 — Complementos (O9, DANFSe).**
Assistente de IA explicativo (M11) e geração de DANFSe a partir de NFS-e com o serviço Go (instalar Go).
Pronto quando: o PDF do DANFSe confere com o leiaute da nota técnica oficial e a IA só explica, sem calcular.

## 9.1 Princípio de fidelidade (vale para todas as fases)

Consequência direta de U2:

- **Sem dado sem fonte.** Cada linha de tabela própria guarda norma, artigo, vigência e data da consulta. Linha sem fonte não entra.
- **Recusar em vez de chutar.** Se uma hipótese não está implementada ou verificada (ex.: tratamento ainda previsto no roadmap da Receita), o sistema mostra "não implementado" e não devolve número. O estado `TRATAMENTO_NAO_IMPLEMENTADO` do motor oficial é repassado como está.
- **Testes só com casos verificáveis**: exemplos oficiais da Receita e da legislação (tabelas da LC 123/2006, exemplos do PGDAS-D, notas técnicas). Casos que não tenham fonte externa são marcados como **não validados** e **não liberam relatório**.
- **Divergência com o motor oficial é bug nosso.** Para IBS/CBS/IS o resultado do motor prevalece; nenhum módulo próprio pode contradizê-lo.
- **Premissas separadas de fatos**: a tela e o PDF distinguem valor oficial vigente, valor de transição previsto em lei e premissa editada pelo usuário.

## 10. O que fica para o construtor

Estrutura de pastas, esquema do banco do app, escolha de bibliotecas de PDF e XML, desenho das telas, estratégia de testes, script de launcher e de atualização.

## 11. Riscos

- Regra própria errada (mitigação: M5, M6, revisão humana na Fase 3).
- Contrato dos motores mudar na Release 16 (mitigação: M3, M4, versão fixada e testada).
- Premissas de alíquota de 2027 em diante são estimativas: o sistema deve exibir quais valores são premissa do usuário e quais vêm da base oficial.
- Cronograma de transição e regras de crédito precisam ser **confirmados contra a LC 214/2025 e a EC 132/2023** antes de entrar nas tabelas; não foram verificados neste documento.
- Portaria Cotec 342/2025 citada pelo usuário: **não verificada**; conferir no texto oficial antes de usá-la como base.
