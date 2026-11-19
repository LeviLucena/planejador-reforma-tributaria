import { useEffect, useRef, useState } from "react";
import type { Fundamentacao, SituacaoTributaria } from "../../../server/src/dominio/tipos";
import type { ConjuntoResumo } from "../../../server/src/premissas/repositorio";
import type { RequisicaoSimulacao, RespostaSimulacao } from "../../../server/src/simulacao/servico";
import { cliente, ErroApi } from "../api/cliente";
import { Campo } from "../componentes/Campo";
import { ResultadoOperacao } from "../componentes/ResultadoOperacao";
import { TabelaItens } from "../componentes/TabelaItens";
import exemploOficial from "../exemplos/operacao-oficial.json";
import {
  type FormSimulador,
  type ItemForm,
  UFS,
  formularioDoExemplo,
  itemVazio,
  montarRequisicao,
  validar,
} from "../simulador/modelo";

interface Props {
  /** Chamado quando uma simulação começa (depois da validação do formulário): o chamador descarta a anterior. */
  aoIniciar?: () => void;
  /** Chamado a cada simulação bem-sucedida, para quem quiser salvar o cenário (Task 13). */
  aoSimular?: (requisicao: RequisicaoSimulacao, resposta: RespostaSimulacao) => void;
}

function descreverConjunto(c: ConjuntoResumo): string {
  const vigencia = c.vigenciaFim ? `${c.vigenciaInicio} a ${c.vigenciaFim}` : `${c.vigenciaInicio} em diante`;
  return `${c.nome} — ${vigencia}${c.validadoPor ? "" : " — pendente de validação"}`;
}

function MensagemErro({ erro }: { erro: ErroApi }) {
  let corpo: React.ReactNode = erro.message;
  if (erro.codigo === "MOTOR_INDISPONIVEL") {
    corpo = (
      <>
        Os motores de cálculo não estão em execução. Para iniciá-los, execute <code>scripts/iniciar.bat</code> na
        raiz do projeto e tente simular de novo.
      </>
    );
  } else if (erro.codigo === "SEM_CONEXAO") {
    corpo = "O servidor do app não responde. Verifique se ele está em execução e tente de novo.";
  }
  return (
    <div role="alert" className="mensagem-erro">
      <strong>Não foi possível simular.</strong> <span>{corpo}</span>
    </div>
  );
}

export function PaginaSimulador({ aoSimular, aoIniciar }: Props) {
  const [form, setForm] = useState<FormSimulador>({
    uf: "",
    municipio: "",
    dataHora: "2027-01-01T12:00",
    conjuntoId: "",
    itens: [itemVazio(1)],
  });
  const [proximaChave, setProximaChave] = useState(2);
  const [conjuntos, setConjuntos] = useState<ConjuntoResumo[] | null>(null);
  const [erroConjuntos, setErroConjuntos] = useState<string | null>(null);
  const [situacoes, setSituacoes] = useState<SituacaoTributaria[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [simulando, setSimulando] = useState(false);
  const [erroApi, setErroApi] = useState<ErroApi | null>(null);
  const [resposta, setResposta] = useState<RespostaSimulacao | null>(null);
  const [fundamentacoes, setFundamentacoes] = useState<Fundamentacao[] | null>(null);
  const [carregandoFund, setCarregandoFund] = useState(false);
  const [erroClassificacoes, setErroClassificacoes] = useState(false);
  const [focoErro, setFocoErro] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  const pedidoFund = useRef(0);

  useEffect(() => {
    let ativo = true;
    cliente.premissas
      .conjuntos()
      .then((lista) => {
        if (!ativo) return;
        setConjuntos(lista);
        setForm((f) => (f.conjuntoId === "" && lista[0] ? { ...f, conjuntoId: String(lista[0].id) } : f));
      })
      .catch((e: unknown) => {
        if (!ativo) return;
        setConjuntos([]);
        setErroConjuntos(e instanceof Error ? e.message : "Erro inesperado.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const dataFato = /^\d{4}-\d{2}-\d{2}/.test(form.dataHora) ? form.dataHora.slice(0, 10) : null;
  useEffect(() => {
    if (!dataFato) return;
    let ativo = true;
    cliente
      .classificacoes(dataFato)
      .then((s) => {
        if (!ativo) return;
        setSituacoes(s);
        setErroClassificacoes(false);
      })
      .catch(() => {
        if (!ativo) return;
        setSituacoes([]);
        setErroClassificacoes(true);
      });
    return () => {
      ativo = false;
    };
  }, [dataFato]);

  // Após uma validação que falhou, o foco vai para o primeiro campo inválido (já renderizado).
  useEffect(() => {
    if (focoErro > 0) formRef.current?.querySelector<HTMLElement>("[aria-invalid]")?.focus();
  }, [focoErro]);

  // Após simular com sucesso, o foco vai para o título do resultado.
  useEffect(() => {
    if (resposta) resultadoRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [resposta]);

  const mudar = (mudanca: Partial<FormSimulador>) => setForm((f) => ({ ...f, ...mudanca }));
  const mudarItem = (chave: number, mudanca: Partial<ItemForm>) =>
    setForm((f) => ({ ...f, itens: f.itens.map((it) => (it.chave === chave ? { ...it, ...mudanca } : it)) }));

  function carregarExemplo() {
    const ex = formularioDoExemplo(exemploOficial);
    setForm((f) => ({ ...f, ...ex }));
    setProximaChave(ex.itens.length + 1);
    setErros({});
  }

  async function simular(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar(form);
    setErros(e);
    if (Object.keys(e).length > 0) {
      setFocoErro((n) => n + 1);
      return;
    }
    const requisicao = montarRequisicao(form);
    const data = requisicao.operacao.dhFatoGerador.slice(0, 10);
    aoIniciar?.();
    setSimulando(true);
    setErroApi(null);
    setResposta(null);
    setFundamentacoes(null);
    setCarregandoFund(false);
    const pedido = ++pedidoFund.current;
    let r: RespostaSimulacao;
    try {
      r = await cliente.simular(requisicao);
    } catch (erro) {
      setErroApi(erro instanceof ErroApi ? erro : new ErroApi("ERRO_INTERNO", "Erro inesperado.", 0));
      setSimulando(false);
      return;
    }
    // O resultado aparece já; a fundamentação legal chega depois, com estado próprio.
    setResposta(r);
    setSimulando(false);
    aoSimular?.(requisicao, r);
    setCarregandoFund(true);
    cliente
      .fundamentacoes(data)
      .then((f) => pedido === pedidoFund.current && setFundamentacoes(f))
      .catch(() => pedido === pedidoFund.current && setFundamentacoes(null))
      .finally(() => pedido === pedidoFund.current && setCarregandoFund(false));
  }

  const conjunto = conjuntos?.find((c) => String(c.id) === form.conjuntoId);
  const semConjuntos = conjuntos !== null && conjuntos.length === 0;
  const mensagensDeErro = Object.keys(erros).length;

  return (
    <section>
      <h1>Simulador de operação</h1>
      <p className="dica">
        Informe a operação e os itens para calcular CBS, IBS e Imposto Seletivo com o motor oficial da Receita.
      </p>

      <form ref={formRef} onSubmit={simular} noValidate>
        <div className="barra-exemplo">
          <button type="button" className="secundario" onClick={carregarExemplo}>
            Carregar exemplo oficial da Receita
          </button>
          <span className="dica">Preenche o formulário com o exemplo oficial da documentação da Receita (4 itens).</span>
        </div>

        <fieldset className="bloco">
          <legend>Operação</legend>
          <div className="grade">
            <Campo id="uf" rotulo="UF" erro={erros.uf}>
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
            <Campo id="municipio" rotulo="Município (código IBGE)" erro={erros.municipio} dica="7 dígitos, por exemplo 4314902 (Porto Alegre).">
              {(a) => (
                <input {...a} inputMode="numeric" maxLength={7} value={form.municipio} onChange={(ev) => mudar({ municipio: ev.target.value })} />
              )}
            </Campo>
            <Campo id="dataHora" rotulo="Data e hora do fato gerador (horário de Brasília)" erro={erros.dataHora} dica="Sempre enviada no horário de Brasília (-03:00), qualquer que seja o fuso do seu navegador.">
              {(a) => (
                <input {...a} type="datetime-local" value={form.dataHora} onChange={(ev) => mudar({ dataHora: ev.target.value })} />
              )}
            </Campo>
            <Campo id="conjunto" rotulo="Conjunto de premissas" erro={erros.conjunto}>
              {(a) => (
                <select {...a} value={form.conjuntoId} disabled={conjuntos === null || semConjuntos} onChange={(ev) => mudar({ conjuntoId: ev.target.value })}>
                  {(conjuntos === null || semConjuntos) && <option value="">{conjuntos === null ? "Carregando…" : "Nenhum disponível"}</option>}
                  {(conjuntos ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {descreverConjunto(c)}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </div>
          {conjunto && !conjunto.validadoPor && (
            <p>
              <span className="etiqueta alerta">pendente de validação</span>{" "}
              <span className="dica">As alíquotas deste conjunto ainda não foram validadas por uma pessoa.</span>
            </p>
          )}
          {semConjuntos && (
            <p role="status" className="mensagem-erro">
              {erroConjuntos ? `Não foi possível carregar os conjuntos de premissas: ${erroConjuntos} ` : ""}
              Nenhum conjunto de premissas cadastrado. Para simular é preciso ter premissas de alíquotas: cadastre-as na
              página Premissas.
            </p>
          )}
        </fieldset>

        <h2>Itens</h2>
        {erroClassificacoes && (
          <p role="status" className="dica">
            Não foi possível carregar as listas de CST e cClassTrib. Digite os códigos à mão (CST com 3 dígitos e
            cClassTrib com 6).
          </p>
        )}
        <TabelaItens
          itens={form.itens}
          situacoes={situacoes}
          erros={erros}
          onMudar={mudarItem}
          onAdicionar={() => {
            setForm((f) => ({ ...f, itens: [...f.itens, itemVazio(proximaChave)] }));
            setProximaChave(proximaChave + 1);
          }}
          onRemover={(chave) => setForm((f) => ({ ...f, itens: f.itens.filter((it) => it.chave !== chave) }))}
        />

        {mensagensDeErro > 0 && (
          <p className="mensagem-erro" role="status">
            Corrija os {mensagensDeErro} campo(s) destacado(s) antes de simular.
          </p>
        )}
        <div className="acoes">
          <button type="submit" disabled={simulando || conjuntos === null || semConjuntos}>
            {simulando ? "Simulando…" : "Simular"}
          </button>
        </div>
      </form>

      {erroApi && <MensagemErro erro={erroApi} />}
      {resposta && (
        <div ref={resultadoRef}>
          <ResultadoOperacao resposta={resposta} fundamentacoes={fundamentacoes} carregandoFundamentacoes={carregandoFund} />
        </div>
      )}
    </section>
  );
}
