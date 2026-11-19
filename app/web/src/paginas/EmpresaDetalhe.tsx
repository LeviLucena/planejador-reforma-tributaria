import { ArrowLeft, CircleAlert, CircleCheck, FolderOpen, LoaderCircle, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Cenario } from "../../../server/src/cenarios/repositorio";
import type { Fundamentacao } from "../../../server/src/dominio/tipos";
import type { Empresa } from "../../../server/src/empresas/repositorio";
import type { ConjuntoResumo } from "../../../server/src/premissas/repositorio";
import { cliente, ErroApi } from "../api/cliente";
import { Icone } from "../componentes/Icone";
import { ResultadoOperacao } from "../componentes/ResultadoOperacao";
import { ResumoEntradas } from "../componentes/ResumoEntradas";
import { AVISO_SIMPLES } from "../componentes/SalvarCenario";
import { dataBrasilia, dataHoraBrasilia, formatarCnpj } from "../formatacao";
import { ROTULO_REGIME } from "./Empresas";

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

const ordenar = (l: Cenario[]) =>
  [...l].sort((a, b) => (a.nome === b.nome ? a.versaoNumero - b.versaoNumero : a.nome.localeCompare(b.nome, "pt-BR")));

const descreverValidacao = (validadoPor: string | null, validadoEm: string | null) =>
  validadoPor
    ? `validado por ${validadoPor} em ${validadoEm ? dataBrasilia(validadoEm) : "data não registrada"}`
    : "pendente de validação";

/**
 * Premissas do selo: vêm do snapshot gravado no cenário (estado do conjunto no momento do cálculo),
 * nunca do estado atual do conjunto. A lista atual só serve para uma dica quando ele mudou depois.
 */
function descreverPremissas(c: Cenario, conjuntos: ConjuntoResumo[] | null): string {
  const s = c.premissasSnapshot;
  if (!s) return `conjunto #${c.conjuntoPremissasId}: snapshot das premissas não disponível (cenário antigo)`;
  const texto = `${s.conjunto.nome} (${descreverValidacao(s.conjunto.validadoPor, s.conjunto.validadoEm)})`;
  const atual = conjuntos?.find((x) => x.id === s.conjunto.id);
  if (atual && atual.validadoPor !== null && s.conjunto.validadoPor === null) {
    return `${texto} — o conjunto foi validado depois deste cálculo`;
  }
  return texto;
}

function MensagemRecalculo({ erro }: { erro: ErroApi | Error }) {
  const codigo = erro instanceof ErroApi ? erro.codigo : "";
  const dica =
    codigo === "MOTOR_INDISPONIVEL" ? " Inicie os motores com scripts/iniciar.bat e tente de novo." : "";
  return (
    <div role="alert" className="mensagem-erro">
      <Icone de={CircleAlert} />
      <strong>Não foi possível recalcular.</strong> <span>{erro.message}</span>
      {dica}
      <p className="dica">As versões anteriores continuam como estavam.</p>
    </div>
  );
}

export function PaginaEmpresaDetalhe() {
  const { id: idTexto } = useParams();
  const empresaId = Number(idTexto);
  const [busca, setBusca] = useSearchParams();
  const cenarioParam = busca.get("cenario");
  const cenarioId = cenarioParam !== null && /^\d+$/.test(cenarioParam) ? Number(cenarioParam) : null;

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [cenarios, setCenarios] = useState<Cenario[] | null>(null);
  const [conjuntos, setConjuntos] = useState<ConjuntoResumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState<Cenario | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);

  const [fund, setFund] = useState<Fundamentacao[] | null>(null);
  const [carregandoFund, setCarregandoFund] = useState(false);
  const pedidoFund = useRef(0);

  const [recalculando, setRecalculando] = useState(false);
  const [erroRecalculo, setErroRecalculo] = useState<ErroApi | Error | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);

  // Guardas de pedido: só a resposta do pedido mais recente (empresa ou cenário) é aplicada.
  const pedidoEmpresa = useRef(0);
  const pedidoCenario = useRef(0);
  const empresaAtual = useRef(empresaId);
  empresaAtual.current = empresaId;

  useEffect(() => {
    const pedido = ++pedidoEmpresa.current;
    setEmpresa(null);
    setCenarios(null);
    setConjuntos(null);
    setErro(null);
    setAberto(null);
    setAviso(null);
    setErroRecalculo(null);
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      setErro("Empresa inválida.");
      return;
    }
    const atual = () => pedido === pedidoEmpresa.current;
    Promise.all([cliente.empresas.obter(empresaId), cliente.cenarios.listar(empresaId)])
      .then(([e, l]) => {
        if (!atual()) return;
        setEmpresa(e);
        setCenarios(ordenar(l));
      })
      .catch((e: unknown) => atual() && setErro(mensagemDe(e)));
    cliente.premissas
      .conjuntos()
      .then((c) => atual() && setConjuntos(c))
      .catch(() => atual() && setConjuntos(null));
  }, [empresaId]);

  // Reabre o cenário escolhido lendo do banco (GET /api/cenarios/:id): nunca chama o motor.
  useEffect(() => {
    const pedido = ++pedidoCenario.current;
    setErroAbrir(null);
    if (cenarioId === null) {
      setAberto(null);
      setAbrindo(false);
      return;
    }
    setAbrindo(true);
    cliente.cenarios
      .obter(cenarioId)
      .then((c) => {
        if (pedido !== pedidoCenario.current) return;
        if (c.empresaId !== empresaId) {
          setAberto(null);
          setErroAbrir(`O cenário #${cenarioId} não pertence a esta empresa.`);
        } else {
          setAberto(c);
        }
        setAbrindo(false);
      })
      .catch((e: unknown) => {
        if (pedido !== pedidoCenario.current) return;
        setAberto(null);
        setErroAbrir(mensagemDe(e));
        setAbrindo(false);
      });
  }, [cenarioId, empresaId]);

  // Fundamentação legal: consulta separada e não bloqueante; o resultado congelado já está na tela.
  // Não é guardada no cenário, então vem do motor em execução agora (guarda de pedido por cenário exibido).
  useEffect(() => {
    const pedido = ++pedidoFund.current;
    setFund(null);
    if (!aberto) {
      setCarregandoFund(false);
      return;
    }
    const dh = aberto.entradaEnviada?.dhFatoGerador ?? aberto.entrada?.dhFatoGerador;
    const data = typeof dh === "string" ? dh.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setCarregandoFund(false);
      return;
    }
    setCarregandoFund(true);
    cliente
      .fundamentacoes(data)
      .then((f) => pedido === pedidoFund.current && setFund(f))
      .catch(() => pedido === pedidoFund.current && setFund(null))
      .finally(() => pedido === pedidoFund.current && setCarregandoFund(false));
  }, [aberto]);

  useEffect(() => {
    if (aberto) resultadoRef.current?.querySelector<HTMLElement>("h2")?.focus();
  }, [aberto]);

  function selecionar(id: number) {
    setAviso(null);
    setErroRecalculo(null);
    setBusca({ cenario: String(id) });
  }

  async function recalcular(base: Cenario) {
    const empresaDoPedido = empresaId;
    setRecalculando(true);
    setErroRecalculo(null);
    setAviso(null);
    try {
      const nova = await cliente.cenarios.recalcular(base.id);
      if (empresaAtual.current !== empresaDoPedido) return; // o usuário já trocou de empresa
      setCenarios((l) => ordenar([...(l ?? []), nova]));
      setAviso(`Nova versão ${nova.versaoNumero} criada para “${nova.nome}”.`);
      setBusca({ cenario: String(nova.id) });
    } catch (e) {
      if (empresaAtual.current !== empresaDoPedido) return;
      setErroRecalculo(e instanceof Error ? e : new Error("Erro inesperado."));
    } finally {
      setRecalculando(false);
    }
  }

  if (erro) {
    return (
      <section>
        <p className="trilha">
          <Link to="/empresas">
            <Icone de={ArrowLeft} />
            Empresas
          </Link>
        </p>
        <div role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          {erro}
        </div>
      </section>
    );
  }
  if (!empresa || cenarios === null)
    return (
      <p className="dica carregando">
        <Icone de={LoaderCircle} className="girando" />
        Carregando…
      </p>
    );

  const grupos = new Map<string, Cenario[]>();
  for (const c of cenarios) grupos.set(c.nome, [...(grupos.get(c.nome) ?? []), c]);

  return (
    <section>
      <p className="trilha">
        <Link to="/empresas">
          <Icone de={ArrowLeft} />
          Empresas
        </Link>
      </p>
      <h1>{empresa.razaoSocial}</h1>
      <dl className="dados-empresa">
        <div>
          <dt>CNPJ</dt>
          <dd>{formatarCnpj(empresa.cnpj)}</dd>
        </div>
        <div>
          <dt>Regime atual</dt>
          <dd>{ROTULO_REGIME[empresa.regimeAtual] ?? empresa.regimeAtual}</dd>
        </div>
        <div>
          <dt>UF / município</dt>
          <dd>
            {empresa.uf} / {empresa.municipioIbge}
          </dd>
        </div>
      </dl>
      {empresa.regimeAtual === "simples" && (
        <p role="alert" className="mensagem-erro aviso-simples">
          <Icone de={TriangleAlert} />
          {AVISO_SIMPLES}
        </p>
      )}

      <h2>Cenários salvos</h2>
      {grupos.size === 0 && (
        <div className="vazio">
          <Icone de={FolderOpen} />
          <p>
            Nenhum cenário salvo. Simule uma operação no <Link to="/">Simulador</Link> e use “Salvar como cenário”.
          </p>
        </div>
      )}
      {[...grupos.entries()].map(([nome, versoes]) => (
        <div key={nome} className="grupo-cenario">
          <h3>{nome}</h3>
          <ul aria-label={`Versões de ${nome}`} className="lista-versoes">
            {versoes.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="secundario"
                  aria-pressed={aberto?.id === v.id || (aberto === null && cenarioId === v.id)}
                  onClick={() => selecionar(v.id)}
                >
                  Versão {v.versaoNumero}
                </button>{" "}
                <span className="dica">
                  criado em {dataHoraBrasilia(v.criadoEm)} · motor: {v.versaoMotor}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {abrindo && (
        <p className="dica carregando">
          <Icone de={LoaderCircle} className="girando" />
          Abrindo o cenário…
        </p>
      )}
      {erroAbrir && (
        <div role="alert" className="mensagem-erro">
          <Icone de={CircleAlert} />
          {erroAbrir}
        </div>
      )}
      {aviso && (
        <p role="status" className="mensagem-ok">
          <Icone de={CircleCheck} />
          {aviso}
        </p>
      )}
      {erroRecalculo && <MensagemRecalculo erro={erroRecalculo} />}

      {aberto && (
        <div ref={resultadoRef}>
          <p aria-label="Selo do resultado congelado" className="selo">
            <Icone de={Lock} />
            {`Resultado congelado em ${dataHoraBrasilia(aberto.criadoEm)} · versão ${aberto.versaoNumero} · motor: ${aberto.versaoMotor} · premissas: ${descreverPremissas(aberto, conjuntos)}`}
          </p>
          <div className="acoes">
            <button type="button" disabled={recalculando} onClick={() => void recalcular(aberto)}>
              <Icone de={RefreshCw} className={recalculando ? "girando" : undefined} />
              {recalculando ? "Recalculando…" : "Recalcular"}
            </button>{" "}
            <span className="dica">
              Recalcula com as premissas atuais do conjunto e o motor em execução; as versões anteriores não são alteradas.
            </span>
          </div>
          <ResumoEntradas entrada={aberto.entrada} entradaEnviada={aberto.entradaEnviada} snapshot={aberto.premissasSnapshot ?? null} />
          <ResultadoOperacao
            resposta={{ resultado: aberto.resultado, entradaEnviada: aberto.entradaEnviada, origensPremissas: aberto.origensPremissas }}
            fundamentacoes={fund}
            carregandoFundamentacoes={carregandoFund}
            reaberto
          />
        </div>
      )}
    </section>
  );
}
