# Planejador da Reforma Tributária: guia de uso local

Este guia é para quem vai usar o sistema no próprio computador, sem precisar saber programar.

## O que é (e o que não é)

- É uma **ferramenta de simulação e planejamento**: você cadastra uma empresa, informa uma operação e
  vê o que a calculadora da reforma tributária (CBS, IBS e Imposto Seletivo) devolve.
- **Não substitui a apuração fiscal**, não emite nota e não calcula imposto devido de verdade.
  Confira sempre com o seu contador.
- Os cálculos são feitos pelos **motores oficiais da Receita Federal** (calculadora de regime regular e
  calculadora do Simples Nacional), rodando no seu computador. O sistema não inventa fórmulas.
- **Regras próprias ainda não existem nesta fase.** O sistema só chama os motores oficiais. Nada sai do
  seu computador: o servidor do app e os dois motores só aceitam conexões de `127.0.0.1` (esta máquina),
  não ficam acessíveis pela rede e não há nuvem.

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

Backup: **feche o app** (`scripts\parar.bat`) e copie esse arquivo para um lugar seguro. Para restaurar,
com o app fechado, coloque a cópia de volta no mesmo lugar.

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

# 3. Regenerar o banco (mesmo comando que o launcher usa)
$env:JAVA_HOME = (Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Filter 'jdk-21*' | Select-Object -First 1).FullName
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
  exatamente o que foi calculado, mesmo que as premissas ou os motores mudem depois.
- **consultada agora**: a informação foi pedida ao motor oficial neste momento (não vem de cópia salva).

## Como funcionam as premissas

- Premissas são as alíquotas usadas no cálculo, agrupadas em **conjuntos** com data de início de vigência.
- Depois de **validado**, um conjunto fica **imutável**. Para mudar algo, use **Duplicar conjunto** e
  edite a cópia.
- As linhas oficiais estão em `dados\premissas\2027-oficial.json`. As fontes (norma, artigo, trecho
  literal, endereço consultado) estão em `dados\premissas\PARA-VALIDACAO.md`, que **você ou o contador
  precisam validar** antes de confiar nelas.
- A **CBS de 2027 não está carregada**: o Senado ainda não fixou a alíquota (situação em 2026-11-18). Se
  quiser simular, digite a sua própria hipótese; ela aparece marcada como **premissa sua**.

## Princípio de fidelidade

Em palavras simples: **quando uma regra não pode ser confirmada em fonte oficial, o sistema recusa em
vez de chutar.** Se faltar uma alíquota, ele mostra o que falta; não preenche com estimativa.

## Para quem desenvolve

`npm run test:integracao` chama os motores de verdade: suba-os antes com `scripts\iniciar.bat`. `npm test` e `npm run typecheck` não precisam dos motores.

## Problemas comuns

- **"Motor indisponível" / "os motores de cálculo não estão em execução"**: rode `scripts\iniciar.bat`
  (sobe só o que estiver parado). Para parar só os motores use `scripts\parar-motores.bat`. Cenários já
  salvos continuam abrindo mesmo sem os motores.
- **Porta em uso**: se outro programa usa a porta 3000, o launcher avisa. Defina outra porta antes de
  iniciar, por exemplo `set PORTA_APP=3001` no Prompt de Comando. Valor inválido (letras, vazio, fora de
  1 a 65535) gera uma mensagem de uma linha e o servidor não sobe.
- **O sistema não abre**: veja os registros em `scripts\.logs\` (`app.err.log`, `regime-regular.err.log`,
  `simples-nacional.err.log`).
- **Motor demora a subir**: na primeira vez pode levar até 2 minutos; o launcher espera e avisa se falhar.

## Roteiro de verificação manual (Chrome)

Roteiro para **você** executar no Chrome. Os quatro números das premissas abaixo são **entradas de
teste suas**, copiadas do exemplo da documentação oficial da calculadora. **Não são alíquotas oficiais.**

1. Rode `scripts\iniciar.bat`. Esperado: a janela mostra "Tudo no ar" e o Chrome (ou o navegador padrão)
   abre em `http://127.0.0.1:3000` com o título "Planejador da Reforma Tributária".
2. Em **Empresas**, cadastre uma empresa de teste. Esperado: ela aparece na lista e abre a página dela.
3. Em **Premissas**, crie um conjunto chamado **Meu cenário de teste** com início em **2027-01-01**.
   Esperado: o conjunto aparece na lista, sem linhas.
4. Nesse conjunto, adicione **quatro linhas**, todas com origem **premissa sua**:
   - CBS = **8.8** (nacional)
   - IBS_UF = **0.05** (UF **RS**)
   - IBS_MUN = **0.05** (município **4314902**)
   - IS_ADVALOREM = **10.0** (nacional)

   Esperado: as quatro linhas aparecem com o selo **premissa sua**.
5. Em **Simulador**, clique em **Carregar exemplo oficial da Receita** e escolha o conjunto **Meu cenário
   de teste**. O exemplo já traz as próprias alíquotas em cada item (CBS 8,8, IBS estadual
   0,05, IBS municipal 0,05 e, no item 2, IS ad valorem 10,0). Por isso os totais saem iguais com ou sem as
   linhas do conjunto. Para ver as premissas sendo usadas, apague os três campos de alíquota de cada item (e o
   ad valorem do IS no item 2): campo em branco significa "usar as premissas". Ao simular, os selos **premissa
   sua** (CBS, IBS UF, IBS município e IS) devem aparecer e os totais continuam **56,76 / 0,64 / 15,00**.
6. Clique em **Simular**. Esperado: totais **CBS 56,76**, **IBS 0,64**, **IS 15,00**; os itens 1 a 3
   calculados e o **item 4 com o erro REG-011** (a recusa vem do motor oficial, não do sistema).
7. Clique em **Salvar como cenário**, dê um nome e confirme. Esperado: o cenário aparece na lista da
   empresa com o selo **resultado congelado**.
8. Feche o navegador e execute `scripts\parar.bat`. Esperado: "Encerrado".
9. Execute `scripts\iniciar.bat` de novo e reabra o cenário salvo. Esperado: entradas, premissas e
   resultado **idênticos** aos do passo 6.
10. Pare **somente os motores**: `scripts\parar-motores.bat`
    (o app continua no ar). Esperado: "regime-regular parado" e "simples-nacional parado".
11. Atualize a página e reabra o cenário salvo. Esperado: ele ainda abre normalmente (resultado congelado).
12. Faça uma nova simulação. Esperado: mensagem **"motor indisponível"** citando `scripts\iniciar.bat`.
13. Para terminar, rode `scripts\iniciar.bat` (religa os motores) ou `scripts\parar.bat` (desliga tudo).
