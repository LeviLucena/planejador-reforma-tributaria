import {
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Inbox,
  Landmark,
  LoaderCircle,
  Lock,
  Plus,
  Scale,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConjuntoResumo,
  LinhaPremissa,
  OrigemPremissa,
  PremissaEntrada,
  TributoPremissa,
} from "../../../server/src/premissas/repositorio";
import { cliente } from "../api/cliente";
import { Campo } from "../componentes/Campo";
import { Icone } from "../componentes/Icone";
import { ROTULO_ORIGEM } from "../componentes/ResultadoOperacao";
import { ERRO_NAO_NUMERICO, lerDecimal } from "../decimais";
import { dataBR, dataBrasilia, formatarDecimalBR } from "../formatacao";
import { UFS } from "../simulador/modelo";

const TRIBUTOS: TributoPremissa[] = ["CBS", "IBS_UF", "IBS_MUN", "IS_ADVALOREM", "IS_ADREM"];
const NACIONAIS: TributoPremissa[] = ["CBS", "IS_ADVALOREM", "IS_ADREM"];

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

function lerTexto(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsText(arquivo);
  });
}

const ICONE_ORIGEM = { oficial: Landmark, lei_transicao: Scale, usuario: User } as const;

function Origem({ origem }: { origem: string }) {
  const icone = ICONE_ORIGEM[origem as keyof typeof ICONE_ORIGEM];
  return (
    <span className={`etiqueta origem-${origem}`}>
      {icone && <Icone de={icone} />}
      {ROTULO_ORIGEM[origem] ?? origem}
    </span>
  );
}

function statusDe(c: ConjuntoResumo) {
  return c.validadoPor ? (
    <span className="etiqueta ok">
      <Icone de={CircleCheck} />
      validado por {c.validadoPor} em {c.validadoEm ? dataBrasilia(c.validadoEm) : "data não registrada"}
    </span>
  ) : (
    <span className="etiqueta alerta">
      <Icone de={Clock} />
      pendente de validação
    </span>
  );
}

function vigenciaDe(c: ConjuntoResumo) {
  return c.vigenciaFim ? `${dataBR(c.vigenciaInicio)} a ${dataBR(c.vigenciaFim)}` : `${dataBR(c.vigenciaInicio)} em diante`;
}

interface FormLinha {
  tributo: TributoPremissa;
  uf: string;
  municipio: string;
  aliquota: string;
  origem: OrigemPremissa;
  fonteNorma: string;
  fonteArtigo: string;
  consultadoEm: string;
}

const LINHA_VAZIA: FormLinha = {
  tributo: "CBS",
  uf: "",
  municipio: "",
  aliquota: "",
  origem: "usuario",
  fonteNorma: "",
  fonteArtigo: "",
  consultadoEm: "",
};

function validarLinha(f: FormLinha): Record<string, string> {
  const e: Record<string, string> = {};
  const aliquota = lerDecimal(f.aliquota);
  if (!aliquota.ok) {
    e.aliquota = aliquota.erro === ERRO_NAO_NUMERICO ? "Informe a alíquota só com números (ex.: 8,8)." : aliquota.erro;
  }
  if (f.tributo === "IBS_MUN" && f.municipio !== "" && !/^\d{7}$/.test(f.municipio)) {
    e.municipio = "O município deve ter exatamente 7 dígitos (código IBGE).";
  }
  if (f.tributo === "IBS_MUN" && f.municipio !== "" && f.uf === "") e.uf = "Informe a UF do município.";
  if (f.origem !== "usuario") {
    if (f.fonteNorma.trim() === "") e.fonteNorma = "Linha oficial ou de lei de transição exige a norma.";
    if (f.fonteArtigo.trim() === "") e.fonteArtigo = "Linha oficial ou de lei de transição exige o artigo.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.consultadoEm)) e.consultadoEm = "Informe a data da consulta à fonte.";
  }
  return e;
}

function montarLinha(f: FormLinha): PremissaEntrada {
  const lida = lerDecimal(f.aliquota);
  const l: PremissaEntrada = { tributo: f.tributo, aliquota: lida.ok ? lida.valor : f.aliquota.trim(), origem: f.origem };
  if (!NACIONAIS.includes(f.tributo) && f.uf !== "") l.uf = f.uf;
  if (f.tributo === "IBS_MUN" && f.municipio !== "") l.municipioIbge = Number(f.municipio);
  if (f.origem !== "usuario") {
    l.fonteNorma = f.fonteNorma.trim();
    l.fonteArtigo = f.fonteArtigo.trim();
    l.consultadoEm = f.consultadoEm;
  } else {
    if (f.fonteNorma.trim() !== "") l.fonteNorma = f.fonteNorma.trim();
    if (f.fonteArtigo.trim() !== "") l.fonteArtigo = f.fonteArtigo.trim();
    if (f.consultadoEm !== "") l.consultadoEm = f.consultadoEm;
  }
  return l;
}

export function PaginaPremissas() {
  const [conjuntos, setConjuntos] = useState<ConjuntoResumo[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [linhas, setLinhas] = useState<LinhaPremissa[] | null>(null);
  const [erroLinhas, setErroLinhas] = useState<string | null>(null);

  const [novo, setNovo] = useState({ nome: "", inicio: "", fim: "", observacao: "" });
  const [errosNovo, setErrosNovo] = useState<Record<string, string>>({});
  const [erroCriar, setErroCriar] = useState<string | null>(null);

  const [form, setForm] = useState<FormLinha>(LINHA_VAZIA);
  const [errosLinha, setErrosLinha] = useState<Record<string, string>>({});
  const [erroAdicionar, setErroAdicionar] = useState<string | null>(null);

  const [msgCarga, setMsgCarga] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const [validador, setValidador] = useState("");
  const [msgDuplicar, setMsgDuplicar] = useState<string | null>(null);
  const [erroDuplicar, setErroDuplicar] = useState<string | null>(null);
  const pedidoLinhas = useRef(0);
  const [erroValidar, setErroValidar] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setConjuntos(await cliente.premissas.conjuntos());
      setErroLista(null);
    } catch (e) {
      setConjuntos((c) => c ?? []);
      setErroLista(mensagemDe(e));
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const carregarLinhas = useCallback(async (id: number) => {
    const pedido = ++pedidoLinhas.current; // só a resposta do pedido mais recente vale
    setLinhas(null);
    setErroLinhas(null);
    try {
      const l = await cliente.premissas.linhas(id);
      if (pedido === pedidoLinhas.current) setLinhas(l);
    } catch (e) {
      if (pedido === pedidoLinhas.current) setErroLinhas(mensagemDe(e));
    }
  }, []);

  function selecionar(id: number) {
    setSelecionado(id);
    setConfirmacao(null);
    setErroValidar(null);
    setErroAdicionar(null);
    setErrosLinha({});
    setMsgDuplicar(null);
    setErroDuplicar(null);
    setValidador("");
    void carregarLinhas(id);
  }

  async function duplicar() {
    if (selecionado === null) return;
    setErroDuplicar(null);
    try {
      const c = await cliente.premissas.duplicar(selecionado);
      await recarregar();
      selecionar(c.id);
      setMsgDuplicar(`Cópia criada: “${c.nome}”. Ela ainda não está validada e pode ser editada.`);
    } catch (erro) {
      setErroDuplicar(mensagemDe(erro));
    }
  }

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (novo.nome.trim() === "") e.nome = "Informe o nome do conjunto.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.inicio)) e.inicio = "Informe o início da vigência.";
    setErrosNovo(e);
    setErroCriar(null);
    if (Object.keys(e).length > 0) return;
    try {
      const c = await cliente.premissas.criarConjunto({
        nome: novo.nome.trim(),
        vigenciaInicio: novo.inicio,
        ...(novo.fim ? { vigenciaFim: novo.fim } : {}),
        ...(novo.observacao.trim() ? { observacao: novo.observacao.trim() } : {}),
      });
      setNovo({ nome: "", inicio: "", fim: "", observacao: "" });
      await recarregar();
      selecionar(c.id);
    } catch (erro) {
      setErroCriar(mensagemDe(erro));
    }
  }

  async function adicionar(ev: React.FormEvent) {
    ev.preventDefault();
    if (selecionado === null || conjuntoValidado) return;
    const e = validarLinha(form);
    setErrosLinha(e);
    setErroAdicionar(null);
    if (Object.keys(e).length > 0) return;
    try {
      await cliente.premissas.adicionarLinha(selecionado, montarLinha(form));
      setForm(LINHA_VAZIA);
      await Promise.all([carregarLinhas(selecionado), recarregar()]);
    } catch (erro) {
      setErroAdicionar(mensagemDe(erro));
    }
  }

  async function aoEscolherArquivo(ev: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    setMsgCarga(null);
    let documento: unknown;
    try {
      documento = JSON.parse((await lerTexto(arquivo)).replace(/^﻿/, ""));
    } catch {
      setMsgCarga({
        tipo: "erro",
        texto: `O arquivo "${arquivo.name}" não é um JSON válido. Escolha um arquivo de premissas no formato { "conjunto": ..., "linhas": [...] }.`,
      });
      if (entradaArquivo.current) entradaArquivo.current.value = "";
      return;
    }
    try {
      const r = await cliente.premissas.carregar(documento);
      setMsgCarga({ tipo: "ok", texto: `Arquivo carregado: ${r.linhas} linha(s) no novo conjunto, ainda pendente de validação.` });
      await recarregar();
      selecionar(r.conjuntoId);
    } catch (erro) {
      setMsgCarga({ tipo: "erro", texto: `Não foi possível carregar o arquivo: ${mensagemDe(erro)}` });
    }
    if (entradaArquivo.current) entradaArquivo.current.value = "";
  }

  async function validarSelecionado(ev: React.FormEvent) {
    ev.preventDefault();
    if (selecionado === null || validador.trim() === "") return;
    setErroValidar(null);
    try {
      const c = await cliente.premissas.validar(selecionado, validador.trim());
      setConfirmacao(`Conjunto validado por ${c.validadoPor} em ${c.validadoEm ? dataBrasilia(c.validadoEm) : "data não registrada"}.`);
      setValidador("");
      await recarregar();
    } catch (erro) {
      setErroValidar(mensagemDe(erro));
    }
  }

  const atual = conjuntos?.find((c) => c.id === selecionado) ?? null;
  const conjuntoValidado = atual?.validadoPor != null;
  const mudarLinha = (m: Partial<FormLinha>) => setForm((f) => ({ ...f, ...m }));
  const precisaFonte = form.origem !== "usuario";
  const mostraUf = !NACIONAIS.includes(form.tributo);

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Premissas de alíquotas</h1>
          <p className="dica">
            Linhas marcadas como <Origem origem="oficial" /> ou <Origem origem="lei_transicao" /> trazem a sua fonte legal
            (norma, artigo e data da consulta). Uma <Origem origem="usuario" /> é uma suposição sua e não tem valor oficial.
            Um conjunto só deixa de estar pendente depois que uma pessoa o valida aqui.
          </p>
        </div>
        <div className="acao-pagina">
          <div className="botao-arquivo">
            <label htmlFor="arquivo-premissas">
              <Icone de={Upload} />
              Carregar arquivo de premissas
            </label>
            <input id="arquivo-premissas" ref={entradaArquivo} type="file" accept=".json,application/json" onChange={aoEscolherArquivo} />
          </div>
        </div>
      </div>
      {msgCarga && (
        <p
          role={msgCarga.tipo === "erro" ? "alert" : "status"}
          className={msgCarga.tipo === "erro" ? "mensagem-erro" : "mensagem-ok"}
        >
          <Icone de={msgCarga.tipo === "erro" ? CircleAlert : CircleCheck} />
          {msgCarga.texto}
        </p>
      )}

      <h2>Conjuntos</h2>
      {erroLista && (
        <p role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          Não foi possível carregar os conjuntos: {erroLista}
        </p>
      )}
      {conjuntos === null && (
        <p className="dica carregando">
          <Icone de={LoaderCircle} className="girando" />
          Carregando…
        </p>
      )}
      {conjuntos !== null && conjuntos.length === 0 && !erroLista && (
        <div className="vazio">
          <Icone de={Inbox} />
          <p className="dica">Nenhum conjunto cadastrado ainda.</p>
        </div>
      )}
      {conjuntos !== null && conjuntos.length > 0 && (
        <div className="tabela-rolagem">
          <table>
            <caption className="sr-only">Conjuntos de premissas</caption>
            <thead>
              <tr>
                <th scope="col">Conjunto</th>
                <th scope="col">Vigência</th>
                <th scope="col" className="num">Linhas</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {conjuntos.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button type="button" className="botao-linha" aria-pressed={c.id === selecionado} onClick={() => selecionar(c.id)}>
                      {c.nome}
                    </button>
                  </td>
                  <td>{vigenciaDe(c)}</td>
                  <td className="num">{c.linhas}</td>
                  <td>{statusDe(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      <form onSubmit={criar} noValidate>
        <fieldset className="bloco">
          <legend>Novo conjunto</legend>
          <div className="grade">
            <Campo id="novo-nome" rotulo="Nome do conjunto" erro={errosNovo.nome}>
              {(a) => <input {...a} value={novo.nome} onChange={(ev) => setNovo({ ...novo, nome: ev.target.value })} />}
            </Campo>
            <Campo id="novo-inicio" rotulo="Início da vigência" erro={errosNovo.inicio}>
              {(a) => <input {...a} type="date" value={novo.inicio} onChange={(ev) => setNovo({ ...novo, inicio: ev.target.value })} />}
            </Campo>
            <Campo id="novo-fim" rotulo="Fim da vigência (opcional)">
              {(a) => <input {...a} type="date" value={novo.fim} onChange={(ev) => setNovo({ ...novo, fim: ev.target.value })} />}
            </Campo>
            <Campo id="novo-obs" rotulo="Observação (opcional)">
              {(a) => <input {...a} value={novo.observacao} onChange={(ev) => setNovo({ ...novo, observacao: ev.target.value })} />}
            </Campo>
          </div>
          {erroCriar && (
            <p role="alert" className="mensagem-erro">
              <Icone de={CircleAlert} />
              {erroCriar}
            </p>
          )}
          <div className="acoes">
            <button type="submit">
              <Icone de={Plus} />
              Criar conjunto
            </button>
          </div>
        </fieldset>
      </form>

      {atual && (
        <section aria-label={`Linhas de ${atual.nome}`}>
          <div className="cabecalho-secao">
            <h2>Linhas de “{atual.nome}”</h2>
            <button type="button" className="secundario" onClick={duplicar}>
              <Icone de={Copy} />
              Duplicar conjunto
            </button>
          </div>
          <p className="status-conjunto">
            {statusDe(atual)} <span className="dica">Vigência: {vigenciaDe(atual)}</span>
          </p>
          {atual.observacao && <p className="dica">{atual.observacao}</p>}
          {erroDuplicar && (
            <p role="alert" className="mensagem-erro">
              <Icone de={CircleAlert} />
              Não foi possível duplicar: {erroDuplicar}
            </p>
          )}
          {msgDuplicar && (
            <p role="status" className="mensagem-ok">
              <Icone de={CircleCheck} />
              {msgDuplicar}
            </p>
          )}
          {erroLinhas && (
            <p role="alert" className="mensagem-erro">
              <Icone de={CircleAlert} />
              Não foi possível carregar as linhas: {erroLinhas}
            </p>
          )}
          {linhas === null && !erroLinhas && (
            <p className="dica carregando">
              <Icone de={LoaderCircle} className="girando" />
              Carregando linhas…
            </p>
          )}
          {linhas !== null && linhas.length === 0 && (
            <div className="vazio">
              <Icone de={Inbox} />
              <p className="dica">Este conjunto ainda não tem linhas.</p>
            </div>
          )}
          {linhas !== null && linhas.length > 0 && (
            <div className="tabela-rolagem alta">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Tributo</th>
                    <th scope="col">UF</th>
                    <th scope="col">Município</th>
                    <th scope="col" className="num">Alíquota (%)</th>
                    <th scope="col">Origem</th>
                    <th scope="col">Fonte</th>
                    <th scope="col">Consultado em</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id}>
                      <td>{l.tributo}</td>
                      <td>{l.uf ?? "—"}</td>
                      <td>{l.municipioIbge ?? "—"}</td>
                      <td className="num">{formatarDecimalBR(l.aliquota)}</td>
                      <td>
                        <Origem origem={l.origem} />
                      </td>
                      <td>{l.fonteNorma ? `${l.fonteNorma}${l.fonteArtigo ? `, ${l.fonteArtigo}` : ""}` : "—"}</td>
                      <td>{l.consultadoEm ? dataBR(l.consultadoEm) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={adicionar} noValidate>
            <fieldset className="bloco" disabled={conjuntoValidado}>
              <legend>Adicionar linha</legend>
              {conjuntoValidado && (
                <p className="nota dica">
                  <Icone de={Lock} />
                  Este conjunto já foi validado e não pode ser alterado. Use “Duplicar conjunto” para criar uma versão
                  editável.
                </p>
              )}
              <div className="grade">
                <Campo id="linha-tributo" rotulo="Tributo">
                  {(a) => (
                    <select {...a} value={form.tributo} onChange={(ev) => mudarLinha({ tributo: ev.target.value as TributoPremissa })}>
                      {TRIBUTOS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
                {mostraUf && (
                  <Campo id="linha-uf" rotulo="UF (opcional)" erro={errosLinha.uf} dica="Em branco = alíquota nacional de reserva.">
                    {(a) => (
                      <select {...a} value={form.uf} onChange={(ev) => mudarLinha({ uf: ev.target.value })}>
                        <option value="">—</option>
                        {UFS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                  </Campo>
                )}
                {form.tributo === "IBS_MUN" && (
                  <Campo id="linha-mun" rotulo="Município (código IBGE, opcional)" erro={errosLinha.municipio}>
                    {(a) => <input {...a} inputMode="numeric" maxLength={7} value={form.municipio} onChange={(ev) => mudarLinha({ municipio: ev.target.value })} />}
                  </Campo>
                )}
                <Campo id="linha-aliquota" rotulo="Alíquota (%)" erro={errosLinha.aliquota}>
                  {(a) => <input {...a} inputMode="decimal" value={form.aliquota} onChange={(ev) => mudarLinha({ aliquota: ev.target.value })} />}
                </Campo>
                <Campo id="linha-origem" rotulo="Origem">
                  {(a) => (
                    <select {...a} value={form.origem} onChange={(ev) => mudarLinha({ origem: ev.target.value as OrigemPremissa })}>
                      <option value="usuario">{ROTULO_ORIGEM.usuario}</option>
                      <option value="oficial">{ROTULO_ORIGEM.oficial}</option>
                      <option value="lei_transicao">{ROTULO_ORIGEM.lei_transicao}</option>
                    </select>
                  )}
                </Campo>
                {precisaFonte && (
                  <>
                    <Campo id="linha-norma" rotulo="Norma" erro={errosLinha.fonteNorma}>
                      {(a) => <input {...a} value={form.fonteNorma} onChange={(ev) => mudarLinha({ fonteNorma: ev.target.value })} />}
                    </Campo>
                    <Campo id="linha-artigo" rotulo="Artigo" erro={errosLinha.fonteArtigo}>
                      {(a) => <input {...a} value={form.fonteArtigo} onChange={(ev) => mudarLinha({ fonteArtigo: ev.target.value })} />}
                    </Campo>
                    <Campo id="linha-consulta" rotulo="Data da consulta" erro={errosLinha.consultadoEm}>
                      {(a) => <input {...a} type="date" value={form.consultadoEm} onChange={(ev) => mudarLinha({ consultadoEm: ev.target.value })} />}
                    </Campo>
                  </>
                )}
              </div>
              {erroAdicionar && (
                <p role="alert" className="mensagem-erro">
                  <Icone de={CircleAlert} />
                  {erroAdicionar}
                </p>
              )}
              <div className="acoes">
                <button type="submit">
                  <Icone de={Plus} />
                  Adicionar linha
                </button>
              </div>
            </fieldset>
          </form>

          <form onSubmit={validarSelecionado} noValidate>
            <fieldset className="bloco">
              <legend>Validar conjunto</legend>
              <p className="dica">
                Validar é uma ação sua: registra o seu nome e a data como responsável por conferir estas alíquotas com as
                fontes.
              </p>
              <Campo id="validador" rotulo="Nome de quem valida">
                {(a) => <input {...a} value={validador} onChange={(ev) => setValidador(ev.target.value)} />}
              </Campo>
              {erroValidar && (
                <p role="alert" className="mensagem-erro">
                  <Icone de={CircleAlert} />
                  {erroValidar}
                </p>
              )}
              {confirmacao && (
                <p role="status" className="mensagem-ok">
                  <Icone de={CircleCheck} />
                  {confirmacao}
                </p>
              )}
              <div className="acoes">
                <button type="submit" disabled={validador.trim() === ""}>
                  <Icone de={ShieldCheck} />
                  Validar conjunto
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </section>
  );
}
