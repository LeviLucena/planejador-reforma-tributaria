import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Empresa } from "../../../server/src/empresas/repositorio";
import type { RequisicaoSimulacao } from "../../../server/src/simulacao/servico";
import { cliente } from "../api/cliente";
import { formatarCnpj } from "../formatacao";
import { Campo } from "./Campo";

interface Props {
  /** A última simulação bem-sucedida: é ela (e não o formulário atual) que será salva. */
  requisicao: RequisicaoSimulacao;
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

/**
 * Painel "Salvar como cenário". Salva SEMPRE a operação e o conjunto que foram simulados (o resultado exibido),
 * mesmo que o formulário tenha sido editado depois; o painel avisa isso. Não executa nada no motor.
 */
export function SalvarCenario({ requisicao }: Props) {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [erroEmpresas, setErroEmpresas] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [nome, setNome] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ empresaId: number; cenarioId: number; nome: string; versao: number } | null>(null);

  useEffect(() => {
    let ativo = true;
    cliente.empresas
      .listar()
      .then((l) => ativo && setEmpresas(l))
      .catch((e: unknown) => {
        if (!ativo) return;
        setEmpresas([]);
        setErroEmpresas(mensagemDe(e));
      });
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (empresaId === "") e.empresa = "Selecione a empresa.";
    if (nome.trim() === "") e.nome = "Informe o nome do cenário.";
    setErros(e);
    setErroSalvar(null);
    setSalvo(null);
    if (Object.keys(e).length > 0) return;
    setSalvando(true);
    try {
      const c = await cliente.cenarios.salvar(Number(empresaId), {
        nome: nome.trim(),
        operacao: requisicao.operacao,
        conjuntoPremissasId: requisicao.conjuntoPremissasId,
      });
      setSalvo({ empresaId: Number(empresaId), cenarioId: c.id, nome: c.nome, versao: c.versaoNumero });
    } catch (erro) {
      setErroSalvar(mensagemDe(erro));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section aria-label="Salvar como cenário" className="bloco painel-salvar">
      <h2>Salvar como cenário</h2>
      <p className="dica">
        Será salvo o resultado exibido acima (a operação e o conjunto de premissas que foram simulados), mesmo que você altere o
        formulário depois. Salvar não recalcula nada.
      </p>
      {empresas === null && <p className="dica">Carregando empresas…</p>}
      {erroEmpresas && (
        <p role="status" className="dica">
          Não foi possível carregar as empresas: {erroEmpresas}
        </p>
      )}
      {empresas !== null && empresas.length === 0 && (
        <p>
          Cadastre uma empresa na página <Link to="/empresas">Empresas</Link> para poder salvar cenários.
        </p>
      )}
      {empresas !== null && empresas.length > 0 && (
        <form onSubmit={salvar} noValidate>
          <div className="grade">
            <Campo id="cen-empresa" rotulo="Empresa" erro={erros.empresa}>
              {(a) => (
                <select {...a} value={empresaId} onChange={(ev) => setEmpresaId(ev.target.value)}>
                  <option value="">Selecione</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.razaoSocial} — {formatarCnpj(e.cnpj)}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo id="cen-nome" rotulo="Nome do cenário" erro={erros.nome}>
              {(a) => <input {...a} value={nome} onChange={(ev) => setNome(ev.target.value)} />}
            </Campo>
          </div>
          <div className="acoes">
            <button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar cenário"}
            </button>
          </div>
        </form>
      )}
      {erroSalvar && (
        <div role="alert" className="mensagem-erro">
          <strong>Não foi possível salvar o cenário.</strong> <span>{erroSalvar}</span>
        </div>
      )}
      {salvo && (
        <p role="status">
          Cenário “{salvo.nome}” salvo (versão {salvo.versao}).{" "}
          <Link to={`/empresas/${salvo.empresaId}?cenario=${salvo.cenarioId}`}>Abrir o cenário salvo</Link>
        </p>
      )}
    </section>
  );
}
