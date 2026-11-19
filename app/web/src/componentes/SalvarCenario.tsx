import { CircleAlert, CircleCheck, LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ResultadoOperacao } from "../../../server/src/dominio/tipos";
import type { Empresa } from "../../../server/src/empresas/repositorio";
import type { RequisicaoSimulacao } from "../../../server/src/simulacao/servico";
import { cliente } from "../api/cliente";
import { formatarCnpj, formatarDecimalBR } from "../formatacao";
import { totaisDe, type Totais } from "../simulador/resultado";
import { Campo } from "./Campo";
import { Icone } from "./Icone";

interface Props {
  /** A última simulação bem-sucedida: é ela (e não o formulário atual) que será salva. */
  requisicao: RequisicaoSimulacao;
  /** O resultado exibido pelo Simulador, para comparar com o que o servidor gravar. */
  exibido?: ResultadoOperacao;
}

export const AVISO_SIMPLES =
  "Esta empresa é optante pelo Simples Nacional. Nesta fase o cálculo usa o motor do regime regular e NÃO representa a apuração do Simples.";

const fmt = (v: string | undefined) => (v === undefined ? "—" : formatarDecimalBR(v));
const mesmosTotais = (a: Totais, b: Totais) => a.cbs === b.cbs && a.ibs === b.ibs && a.is === b.is;

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

/**
 * Painel "Salvar como cenário". Envia a operação e o conjunto que foram simulados (não o formulário atual).
 * O servidor EXECUTA DE NOVO a operação no motor com as premissas atuais e grava o resultado dessa nova
 * execução; o painel mostra os totais gravados e avisa se diferirem dos exibidos.
 */
export function SalvarCenario({ requisicao, exibido }: Props) {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [erroEmpresas, setErroEmpresas] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [nome, setNome] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{
    empresaId: number;
    cenarioId: number;
    nome: string;
    versao: number;
    totais: Totais;
  } | null>(null);

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

  const empresaEscolhida = empresas?.find((e) => String(e.id) === empresaId);

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
      setSalvo({
        empresaId: Number(empresaId),
        cenarioId: c.id,
        nome: c.nome,
        versao: c.versaoNumero,
        totais: totaisDe(c.resultado),
      });
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
        Ao salvar, a operação simulada acima (e o conjunto de premissas escolhido nela), mesmo que você altere o formulário
        depois, é executada de novo no motor com as premissas atuais, e é o resultado dessa nova execução que fica gravado.
      </p>
      {empresas === null && (
        <p className="dica carregando">
          <Icone de={LoaderCircle} className="girando" />
          Carregando empresas…
        </p>
      )}
      {erroEmpresas && (
        <p role="status" className="dica nota">
          <Icone de={TriangleAlert} />
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
            {empresaEscolhida?.regimeAtual === "simples" && (
              <p role="alert" className="mensagem-erro aviso-simples">
                <Icone de={TriangleAlert} />
                {AVISO_SIMPLES}
              </p>
            )}
            <Campo id="cen-nome" rotulo="Nome do cenário" erro={erros.nome}>
              {(a) => <input {...a} value={nome} onChange={(ev) => setNome(ev.target.value)} />}
            </Campo>
          </div>
          <div className="acoes">
            <button type="submit" disabled={salvando}>
              <Icone de={salvando ? LoaderCircle : Save} className={salvando ? "girando" : undefined} />
              {salvando ? "Salvando…" : "Salvar cenário"}
            </button>
          </div>
        </form>
      )}
      {erroSalvar && (
        <div role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          <strong>Não foi possível salvar o cenário.</strong> <span>{erroSalvar}</span>
        </div>
      )}
      {salvo && (
        <div role="status" className="mensagem-ok">
          <Icone de={CircleCheck} />
          <div>
            <p>
              Cenário “{salvo.nome}” salvo (versão {salvo.versao}).{" "}
              <Link to={`/empresas/${salvo.empresaId}?cenario=${salvo.cenarioId}`}>Abrir o cenário salvo</Link>
            </p>
            <p aria-label="Totais salvos">
              Totais gravados: CBS {fmt(salvo.totais.cbs)} · IBS {fmt(salvo.totais.ibs)} · IS {fmt(salvo.totais.is)}
            </p>
            {exibido && !mesmosTotais(salvo.totais, totaisDe(exibido)) && (
              <p className="mensagem-erro">
                <Icone de={TriangleAlert} />
                O resultado salvo difere do exibido acima (premissas ou motor mudaram desde a simulação).
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
