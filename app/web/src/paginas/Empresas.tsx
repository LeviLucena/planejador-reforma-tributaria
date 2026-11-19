import { Building2, CircleAlert, CircleCheck, LoaderCircle, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Empresa, RegimeAtual } from "../../../server/src/empresas/repositorio";
import { cliente } from "../api/cliente";
import { Campo } from "../componentes/Campo";
import { Icone } from "../componentes/Icone";
import { formatarCnpj } from "../formatacao";
import { UFS } from "../simulador/modelo";

export const ROTULO_REGIME: Record<RegimeAtual, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

interface FormEmpresa {
  razaoSocial: string;
  cnpj: string;
  regime: string;
  uf: string;
  municipio: string;
}

const FORM_VAZIO: FormEmpresa = { razaoSocial: "", cnpj: "", regime: "", uf: "", municipio: "" };

function validar(f: FormEmpresa): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.razaoSocial.trim() === "") e.razaoSocial = "Informe a razão social.";
  if (f.cnpj.replace(/\D/g, "").length !== 14) e.cnpj = "O CNPJ deve ter 14 dígitos (com ou sem pontuação).";
  if (!(f.regime in ROTULO_REGIME)) e.regime = "Selecione o regime atual.";
  if (!UFS.includes(f.uf)) e.uf = "Selecione a UF.";
  if (!/^\d{7}$/.test(f.municipio)) e.municipio = "O município deve ter exatamente 7 dígitos (código IBGE).";
  return e;
}

// PUT é substituição completa: sempre se enviam todos os campos.
function corpoDe(f: FormEmpresa) {
  return {
    razaoSocial: f.razaoSocial.trim(),
    cnpj: f.cnpj.replace(/\D/g, ""),
    regimeAtual: f.regime,
    uf: f.uf,
    municipioIbge: f.municipio,
  };
}

const formDe = (e: Empresa): FormEmpresa => ({
  razaoSocial: e.razaoSocial,
  cnpj: formatarCnpj(e.cnpj),
  regime: e.regimeAtual,
  uf: e.uf,
  municipio: e.municipioIbge,
});

export function PaginaEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [form, setForm] = useState<FormEmpresa>(FORM_VAZIO);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [focoErro, setFocoErro] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setEmpresas(await cliente.empresas.listar());
      setErroLista(null);
    } catch (e) {
      setEmpresas((l) => l ?? []);
      setErroLista(mensagemDe(e));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (focoErro > 0) formRef.current?.querySelector<HTMLElement>("[aria-invalid]")?.focus();
  }, [focoErro]);

  const mudar = (m: Partial<FormEmpresa>) => setForm((f) => ({ ...f, ...m }));

  function cancelarEdicao() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErros({});
    setErroServidor(null);
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setAviso(null);
    const e = validar(form);
    setErros(e);
    setErroServidor(null);
    if (Object.keys(e).length > 0) {
      setFocoErro((n) => n + 1);
      return;
    }
    setSalvando(true);
    try {
      const corpo = corpoDe(form);
      if (editando) {
        const salva = await cliente.empresas.atualizar(editando.id, corpo);
        setEmpresas((l) => (l ?? []).map((x) => (x.id === salva.id ? salva : x)));
        setAviso(`Empresa “${salva.razaoSocial}” atualizada.`);
      } else {
        const criada = await cliente.empresas.criar(corpo);
        setEmpresas((l) => [...(l ?? []), criada]);
        setAviso(`Empresa “${criada.razaoSocial}” cadastrada.`);
      }
      setEditando(null);
      setForm(FORM_VAZIO);
    } catch (erro) {
      setErroServidor(mensagemDe(erro));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(e: Empresa) {
    setExcluindo(true);
    setErroExcluir(null);
    try {
      await cliente.empresas.remover(e.id);
      setEmpresas((l) => (l ?? []).filter((x) => x.id !== e.id));
      setConfirmando(null);
      if (editando?.id === e.id) cancelarEdicao();
      setAviso(`Empresa “${e.razaoSocial}” excluída.`);
    } catch (erro) {
      setErroExcluir(mensagemDe(erro));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1>Empresas</h1>
          <p className="dica">Cadastre as empresas para guardar cenários de simulação e acompanhar as versões de cada um.</p>
        </div>
      </div>

      <form ref={formRef} onSubmit={enviar} noValidate aria-label={editando ? "Editar empresa" : "Nova empresa"}>
        <fieldset className="bloco">
          <legend>{editando ? `Editar empresa: ${editando.razaoSocial}` : "Nova empresa"}</legend>
          <div className="grade">
            <Campo id="emp-razao" className="largo" rotulo="Razão social" erro={erros.razaoSocial}>
              {(a) => <input {...a} value={form.razaoSocial} onChange={(ev) => mudar({ razaoSocial: ev.target.value })} />}
            </Campo>
            <Campo id="emp-cnpj" rotulo="CNPJ" erro={erros.cnpj} dica="Com ou sem pontuação; é guardado só com os 14 dígitos.">
              {(a) => <input {...a} inputMode="numeric" value={form.cnpj} onChange={(ev) => mudar({ cnpj: ev.target.value })} />}
            </Campo>
            <Campo id="emp-regime" rotulo="Regime atual" erro={erros.regime}>
              {(a) => (
                <select {...a} value={form.regime} onChange={(ev) => mudar({ regime: ev.target.value })}>
                  <option value="">Selecione</option>
                  {(Object.keys(ROTULO_REGIME) as RegimeAtual[]).map((r) => (
                    <option key={r} value={r}>
                      {ROTULO_REGIME[r]}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo id="emp-uf" rotulo="UF" erro={erros.uf}>
              {(a) => (
                <select {...a} value={form.uf} onChange={(ev) => mudar({ uf: ev.target.value })}>
                  <option value="">Selecione</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo id="emp-municipio" rotulo="Município (código IBGE)" erro={erros.municipio} dica="7 dígitos, por exemplo 4314902 (Porto Alegre).">
              {(a) => (
                <input {...a} inputMode="numeric" maxLength={7} value={form.municipio} onChange={(ev) => mudar({ municipio: ev.target.value })} />
              )}
            </Campo>
          </div>
        </fieldset>
        {Object.keys(erros).length > 0 && (
          <p className="mensagem-erro" role="status">
            <Icone de={CircleAlert} />
            Corrija os {Object.keys(erros).length} campo(s) destacado(s) antes de continuar.
          </p>
        )}
        {erroServidor && (
          <div role="alert" className="mensagem-erro">
            <Icone de={CircleAlert} />
            <strong>Não foi possível salvar a empresa.</strong> <span>{erroServidor}</span>
          </div>
        )}
        <div className="acoes">
          <button type="submit" disabled={salvando}>
            <Icone de={salvando ? LoaderCircle : editando ? Save : Plus} className={salvando ? "girando" : undefined} />
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar empresa"}
          </button>
          {editando && (
            <button type="button" className="secundario" onClick={cancelarEdicao}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {aviso && (
        <p role="status" className="mensagem-ok">
          <Icone de={CircleCheck} />
          {aviso}
        </p>
      )}

      <h2>Empresas cadastradas</h2>
      {erroLista && (
        <div role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          Não foi possível carregar as empresas: {erroLista}
        </div>
      )}
      {erroExcluir && (
        <div role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          <strong>Não foi possível excluir.</strong> <span>{erroExcluir}</span>
        </div>
      )}
      {empresas === null && (
        <p className="dica carregando">
          <Icone de={LoaderCircle} className="girando" />
          Carregando…
        </p>
      )}
      {empresas !== null && empresas.length === 0 && !erroLista && (
        <div className="vazio">
          <Icone de={Building2} />
          <p>Nenhuma empresa cadastrada.</p>
          <p className="dica">Use o formulário acima para cadastrar a primeira.</p>
        </div>
      )}
      {empresas !== null && empresas.length > 0 && (
        <div className="tabela-rolagem">
          <table aria-label="Empresas cadastradas" className="tabela-texto">
            <thead>
              <tr>
                <th scope="col">Razão social</th>
                <th scope="col">CNPJ</th>
                <th scope="col">Regime</th>
                <th scope="col">UF / município</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/empresas/${e.id}`}>{e.razaoSocial}</Link>
                  </td>
                  <td>{formatarCnpj(e.cnpj)}</td>
                  <td>{ROTULO_REGIME[e.regimeAtual] ?? e.regimeAtual}</td>
                  <td>
                    {e.uf} / {e.municipioIbge}
                  </td>
                  <td className="celula-acoes">
                    {confirmando === e.id ? (
                      <div className="confirmacao">
                        <p>
                          Excluir “{e.razaoSocial}”? Os cenários salvos desta empresa também serão excluídos. Esta ação não pode ser
                          desfeita.
                        </p>
                        <button type="button" className="perigo" disabled={excluindo} onClick={() => void excluir(e)}>
                          <Icone de={excluindo ? LoaderCircle : Trash2} className={excluindo ? "girando" : undefined} />
                          {excluindo ? "Excluindo…" : "Confirmar exclusão"}
                        </button>
                        <button type="button" className="secundario" disabled={excluindo} onClick={() => setConfirmando(null)}>
                          Cancelar exclusão
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="fantasma"
                          aria-label={`Editar ${e.razaoSocial}`}
                          onClick={() => {
                            setEditando(e);
                            setForm(formDe(e));
                            setErros({});
                            setErroServidor(null);
                            setAviso(null);
                            formRef.current?.scrollIntoView?.({ block: "start" });
                          }}
                        >
                          <Icone de={Pencil} />
                          Editar
                        </button>
                        <button
                          type="button"
                          className="fantasma perigo-texto"
                          aria-label={`Excluir ${e.razaoSocial}`}
                          onClick={() => {
                            setConfirmando(e.id);
                            setErroExcluir(null);
                          }}
                        >
                          <Icone de={Trash2} />
                          Excluir
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
