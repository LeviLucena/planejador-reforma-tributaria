# Planejador da Reforma Tributária: guia de uso local

Este guia é para quem vai usar o sistema no próprio computador, sem precisar saber programar.

## O que é (e o que não é)

- É uma **ferramenta de simulação e planejamento**: você cadastra uma empresa, informa uma operação e
  vê o que a calculadora da reforma tributária (CBS, IBS e Imposto Seletivo) devolve.
- **Não substitui a apuração fiscal**, não emite nota e não calcula imposto devido de verdade.
  Confira sempre com o seu contador.
- Os cálculos são feitos pelo **motor oficial da Receita Federal para o regime regular**, rodando no seu
  computador. O sistema não inventa fórmulas. O **motor do Simples Nacional** também é instalado e
  iniciado, mas **ainda não calcula nada nesta fase; só é consultada a versão dele**.
- **Empresa do Simples Nacional**: o cálculo também é feito pelo motor do regime regular e **não
  representa a apuração do Simples**. A tela avisa isso sempre que a empresa escolhida é optante pelo
  Simples.
- **Regras próprias ainda não existem nesta fase.** O sistema só chama os motores oficiais. Nada sai do
  seu computador: o servidor do app e os dois motores só aceitam conexões de `127.0.0.1` (esta máquina),
  não ficam acessíveis pela rede e não há nuvem.
- **Proteção contra outros sites**: o servidor do app só atende a própria página, aberta em
  `http://127.0.0.1:3000` ou `http://localhost:3000`. Páginas de outros sites abertas no mesmo navegador
  não conseguem ler nem alterar os seus dados (pedidos vindos de outra origem ou endereço recebem
  "Acesso negado").

## Pré-requisitos

Instale uma vez (PowerShell ou Prompt de Comando):

```
winget install EclipseAdoptium.Temurin.21.JDK
winget install OpenJS.NodeJS.LTS
```

- **JDK 21** (Java), para os motores oficiais.
- **Node.js 22 ou mais novo**, para o servidor e a interface.

Depois de instalar, feche e abra o terminal. O launcher confere os dois e avisa, em português, se algum
estiver faltando.

### Primeira instalação em outra máquina: os motores oficiais

Os motores oficiais não fazem parte deste repositório (são clones separados, ignorados pelo git). Numa
máquina nova, na pasta do projeto, baixe os dois repositórios públicos da Receita Federal e fixe os
commits registrados em `motores\VERSOES.md`:

```powershell
git clone https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git motores\regime-regular
git clone https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional.git motores\simples-nacional
git -C motores\regime-regular checkout <commit do regime regular em motores\VERSOES.md>
git -C motores\simples-nacional checkout <commit do Simples Nacional em motores\VERSOES.md>
```

Depois disso, o `scripts\iniciar.bat` gera o banco dos motores e os compila na primeira execução.

## Primeiro uso, passo a passo

1. Abra a pasta do projeto e dê dois cliques em `scripts\iniciar.bat` (ou rode-o no terminal).
2. Na primeira vez ele instala as dependências, gera o banco dos motores e compila os motores. Pode
   levar alguns minutos; as próximas vezes são rápidas.
3. Quando aparecer "Tudo no ar", o navegador abre em `http://127.0.0.1:3000`.
4. Para forçar a reconstrução da interface: `scripts\iniciar.bat -Reconstruir`.
5. Rodar o `iniciar.bat` de novo é seguro: ele não duplica nada ("já em execução").

A janela do launcher pode ser fechada: o sistema continua rodando em segundo plano.

Não canalize nem redirecione a saída do `iniciar.bat` num terminal (por exemplo `| more` ou `> arquivo`): os
processos em segundo plano herdam o canal e o comando parece travado. Dar dois cliques no arquivo funciona
normalmente. A interface é reconstruída automaticamente quando um arquivo de `app\web\src` fica mais novo que
o último build; mudanças que essa checagem não enxerga (arquivos apagados, configuração do Vite,
`package.json`) exigem `scripts\iniciar.bat -Reconstruir` (ou apagar a pasta `app\web\dist`).

## Como parar

Execute `scripts\parar.bat`. Ele encerra somente os processos que o próprio launcher iniciou (servidor
do app e os dois motores).

## Onde ficam os dados e como fazer backup

Tudo que você cadastra (empresas, conjuntos de premissas, cenários) fica em um único arquivo:

```
app\server\data\reforma.db
```

Cada gravação vai direto para esse arquivo (o banco não usa arquivos auxiliares de diário), então ele
sozinho é o backup completo.

Backup: **feche o app** (`scripts\parar.bat`) e copie `reforma.db` para um lugar seguro. Para restaurar,
com o app fechado, coloque a cópia de volta no mesmo lugar.

Se ao lado dele existirem arquivos `reforma.db-wal` ou `reforma.db-shm` (criados por uma versão anterior
do app), **inicie e pare o app uma vez** (`scripts\iniciar.bat` e depois `scripts\parar.bat`) antes de
copiar: ao iniciar, o app passa tudo para o `reforma.db` e esses arquivos deixam de ser usados.

## Como atualizar os motores oficiais

Os motores são repositórios separados em `motores\regime-regular` e `motores\simples-nacional`.
Faça com o app e os motores parados. No PowerShell, na pasta do projeto:

```powershell
scripts\parar.bat

# 1. Atualizar o código de cada motor
git -C motores\regime-regular pull
git -C motores\simples-nacional pull

# 2. Apagar o banco dos motores (o launcher só o gera se não existir)
Remove-Item motores\regime-regular\calculadora\db\calculadora-pro.db
Remove-Item motores\simples-nacional\calculadora\db\calculadora-pro.db

# 3. Regenerar o banco (mesmo comando que o launcher usa; JDK 21 mais novo, como o launcher escolhe)
$env:JAVA_HOME = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' | Sort-Object Name -Descending | Select-Object -First 1).FullName
Push-Location motores\regime-regular
.\mvnw.cmd flyway:migrate '-Dflyway.configFiles=flyway\flyway-pro.conf'
Pop-Location

# 4. Recompilar os dois JARs
Push-Location motores\regime-regular;   .\mvnw.cmd clean package -DskipTests; Pop-Location
Push-Location motores\simples-nacional; .\mvnw.cmd clean package -DskipTests; Pop-Location

# 5. Subir de novo; o launcher copia o banco novo para o simples-nacional
scripts\iniciar.bat
```

Por fim, atualize `motores\VERSOES.md` com os novos commits (`git -C motores\regime-regular rev-parse HEAD`
e o equivalente do outro motor) e com a resposta de `http://127.0.0.1:8082/api/versao`.

## O que significam os selos e rótulos

- **oficial**: alíquota fixada em fonte oficial (por exemplo resolução do Senado ou lei específica).
- **lei de transição**: valor fixado pela própria lei da reforma para o período de transição (por
  exemplo o IBS de 0,05% estadual e 0,05% municipal em 2027 e 2028, art. 344 da LC 214/2025).
- **premissa sua**: valor que **você** digitou. É uma hipótese de trabalho, não um dado oficial.
- **pendente de validação**: o dado foi levantado em fonte oficial, mas nenhuma pessoa o conferiu ainda
  (campo "validado por" vazio). Use com cautela até validar.
- **resultado congelado**: um cenário salvo guarda o resultado da época. Reabrir o cenário mostra
  exatamente o que foi calculado, mesmo que as premissas ou os motores mudem depois. O selo aparece ao
  **abrir** o cenário (não na lista de versões).
- **premissas do selo**: o cenário guarda uma fotografia do conjunto de premissas no momento do cálculo
  (nome, validação e todas as linhas). O selo mostra essa fotografia, não o estado atual do conjunto; se o
  conjunto foi validado depois, aparece a observação "o conjunto foi validado depois deste cálculo".
  Cenários salvos por uma versão anterior do app mostram "snapshot das premissas não disponível (cenário
  antigo)".
- **da premissa / informada por você**: no resumo das entradas de um cenário reaberto, cada alíquota de
  cada item diz se veio do conjunto de premissas ou se foi digitada por você.
- **consultada agora**: a informação foi pedida ao motor oficial neste momento (não vem de cópia salva).
  É o caso da fundamentação legal ao reabrir um cenário.

## Salvar um cenário: o que acontece

Ao clicar em **Salvar cenário**, o servidor **executa de novo** a operação simulada no motor oficial,
com as premissas atuais do conjunto escolhido, e grava o resultado **dessa nova execução**. Logo após
salvar, o painel mostra os totais gravados; se forem diferentes dos exibidos na simulação (porque as
premissas ou o motor mudaram nesse meio-tempo), aparece o aviso "O resultado salvo difere do exibido
acima". Por isso o motor do regime regular precisa estar no ar para salvar. Se só o motor do Simples
estiver fora do ar, o cenário é salvo e a versão dele fica registrada como `simples=indisponivel`.

## Como funcionam as premissas

- Premissas são as alíquotas usadas no cálculo, agrupadas em **conjuntos** com data de início de vigência.
- Depois de **validado**, um conjunto fica **imutável**. Para mudar algo, use **Duplicar conjunto** e
  edite a cópia.
- As linhas oficiais estão em `dados\premissas\2027-oficial.json`. Para usá-las, na página
  **Premissas** use **Carregar arquivo de premissas** e escolha esse arquivo. Isso cria um **conjunto
  novo**, que fica **pendente de validação** até alguém validá-lo. As fontes (norma, artigo, trecho
  literal, endereço consultado) estão em `dados\premissas\PARA-VALIDACAO.md`, que **você ou o contador
  precisam validar** antes de confiar nelas.
- A **CBS de 2027 não está carregada**: o Senado ainda não fixou a alíquota (situação em 2026-11-18). Se
  quiser simular, digite a sua própria hipótese; ela aparece marcada como **premissa sua**.
- Campo de alíquota em branco num item significa "usar as premissas", tributo a tributo: só o que você
  deixou em branco é buscado no conjunto. Um item com Imposto Seletivo e sem alíquota de IS própria exige
  uma linha de IS (IS_ADVALOREM ou IS_ADREM) no conjunto; sem ela, a simulação é recusada e diz o que falta.

### Como digitar números

Use **vírgula** para decimais: `8,8`, `100,50`, `1.200,50`. O ponto também é aceito como separador
decimal quando não pode ser confundido com milhar (`0.05`, `8.8`, `100.00`). Um valor como `1.200`
(ponto como milhar, sem vírgula) é **recusado** com a mensagem "Use vírgula para decimais (ex.: 1200,00).
"1.200" é ambíguo.", porque seria lido como 1,2. Digite `1200` ou `1.200,00`.

## Princípio de fidelidade

Em palavras simples: **quando uma regra não pode ser confirmada em fonte oficial, o sistema recusa em
vez de chutar.** Se faltar uma alíquota, ele mostra o que falta; não preenche com estimativa.

## Para quem desenvolve

`npm run test:integracao` chama os motores de verdade: suba-os antes com `scripts\iniciar.bat`. `npm test` e `npm run typecheck` não precisam dos motores.

Servidor de desenvolvimento da interface (Vite, porta 5173): a proteção contra outros sites só aceita a
origem `http://127.0.0.1:5173` / `http://localhost:5173` se o servidor do app for iniciado com a variável
`MODO_DEV=1` (por exemplo `set MODO_DEV=1` e depois `npm -w app/server run dev`, e em outro terminal
`npm -w app/web run dev`). O launcher nunca liga esse modo.

## Problemas comuns

- **"Motor indisponível" / "os motores de cálculo não estão em execução"**: rode `scripts\iniciar.bat`
  (sobe só o que estiver parado). Para parar só os motores use `scripts\parar-motores.bat`. Cenários já
  salvos continuam abrindo mesmo sem os motores.
- **Porta em uso**: se outro programa usa a porta 3000, o launcher avisa e o servidor mostra uma mensagem
  de uma linha ("a porta 3000 já está em uso por outro programa..."). Defina outra porta antes de
  iniciar, por exemplo `set PORTA_APP=3001` no Prompt de Comando. Valor inválido (letras, vazio, fora de
  1 a 65535) gera uma mensagem de uma linha e o servidor não sobe.
- **"Acesso negado"**: o endereço usado não é `127.0.0.1` nem `localhost` na porta do app (por exemplo o
  nome do computador ou outro endereço). Abra `http://127.0.0.1:3000`.
- **O sistema não abre**: veja os registros em `scripts\.logs\` (`app.err.log`, `regime-regular.err.log`,
  `simples-nacional.err.log`).
- **Motor demora a subir**: na primeira vez pode levar até 2 minutos; o launcher espera e avisa se falhar.

## Roteiro de verificação manual (Chrome)

Roteiro para **você** executar no Chrome. Os quatro números das premissas abaixo são **entradas de
teste suas**, copiadas do exemplo da documentação oficial da calculadora. **Não são alíquotas oficiais.**

1. Rode `scripts\iniciar.bat`. Esperado: a janela mostra "Tudo no ar" e o Chrome (ou o navegador padrão)
   abre em `http://127.0.0.1:3000` com o título "Planejador da Reforma Tributária".
2. Em **Empresas**, cadastre uma empresa de teste. O CNPJ precisa ter dígitos verificadores válidos; para
   teste use **11.222.333/0001-81** (número de exemplo para teste, montado só para ter dígitos verificadores
   válidos; não o use para nada real). Esperado: ela aparece na lista e abre a página dela.
3. Em **Premissas**, crie um conjunto chamado **Meu cenário de teste** com início em **2027-01-01**.
   Esperado: o conjunto aparece na lista, sem linhas.
4. Nesse conjunto, adicione **quatro linhas**, todas com origem **premissa sua**:
   - CBS = **8.8** (nacional)
   - IBS_UF = **0.05** (UF **RS**)
   - IBS_MUN = **0.05** (UF **RS** e município **4314902**; sem a UF o formulário recusa a linha)
   - IS_ADVALOREM = **10.0** (nacional)

   Esperado: as quatro linhas aparecem com o selo **premissa sua**.
5. Em **Simulador**, clique em **Carregar exemplo oficial da Receita** e escolha o conjunto **Meu cenário
   de teste**. O exemplo já traz as próprias alíquotas em cada item (CBS 8,8, IBS estadual
   0,05, IBS municipal 0,05 e, no item 2, IS ad valorem 10,0). Por isso os totais saem iguais com ou sem as
   linhas do conjunto. Para ver as premissas sendo usadas, apague os três campos de alíquota de cada item (e o
   ad valorem do IS no item 2): campo em branco significa "usar as premissas". Ao simular, os selos **premissa
   sua** (CBS, IBS UF, IBS município e IS) devem aparecer e os totais continuam **56,76 / 0,64 / 15,00**.
6. Clique em **Simular**. Esperado: totais **CBS 56,76**, **IBS 0,64**, **IS 15,00**; os itens 1 a 3
   calculados e o **item 4 com o erro REG-011** (a recusa vem do motor oficial, não do sistema); a linha
   "Cálculo feito pelo motor oficial do regime regular."
7. Em **Salvar como cenário**, escolha a empresa, dê um nome e confirme. Esperado: "Cenário ... salvo
   (versão 1)" e "Totais gravados: CBS 56,76 · IBS 0,64 · IS 15,00", sem aviso de diferença. O cenário
   aparece na lista da empresa; ao **abri-lo**, aparece o selo **resultado congelado** com as premissas
   do momento do cálculo e o resumo das entradas.
8. Feche o navegador e execute `scripts\parar.bat`. Esperado: "Encerrado".
9. Execute `scripts\iniciar.bat` de novo e reabra o cenário salvo. Esperado: entradas (resumo
   "Entradas usadas neste cálculo"), premissas e resultado **idênticos** aos do passo 6.
10. Pare **somente os motores**: `scripts\parar-motores.bat`
    (o app continua no ar). Esperado: "regime-regular parado" e "simples-nacional parado".
11. Atualize a página e reabra o cenário salvo. Esperado: ele ainda abre normalmente (resultado congelado).
12. Faça uma nova simulação. Esperado: a mensagem "Não foi possível simular. Os motores de cálculo não
    estão em execução. Para iniciá-los, execute scripts/iniciar.bat na raiz do projeto e tente simular de
    novo."
13. Para terminar, rode `scripts\iniciar.bat` (religa os motores) ou `scripts\parar.bat` (desliga tudo).
