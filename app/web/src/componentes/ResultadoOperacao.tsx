import { useState } from "react";
import type { Fundamentacao, ItemEntrada, ObjetoResultado } from "../../../server/src/dominio/tipos";
import type { RespostaSimulacao } from "../../../server/src/simulacao/servico";
import { formatarDecimalBR } from "../formatacao";
import { memoriasDoItem, totaisDe, valoresDoItem } from "../simulador/resultado";

export const ROTULO_ORIGEM: Record<string, string> = {
  oficial: "oficial",
  lei_transicao: "lei de transição",
  usuario: "premissa sua",
};

// O motor devolve a referência normativa com "\n" escrito como texto (barra + n); aqui vira quebra de linha.
const quebrarLinhas = (t: string) => t.split(String.fromCharCode(92) + "n").join(String.fromCharCode(10));

const brl =(v: string | undefined) => (v === undefined ? "—" : formatarDecimalBR(v));

interface PropsItem {
  objeto: ObjetoResultado;
  cClassTribEntrada?: string;
  fundamentacoes: Fundamentacao[] | null;
  carregandoFundamentacoes: boolean;
  reaberto: boolean;
}

function ItemResultado({ objeto, cClassTribEntrada, fundamentacoes, carregandoFundamentacoes, reaberto }: PropsItem) {
  const [aberto, setAberto] = useState(false);
  const v = valoresDoItem(objeto);
  const cClassTrib = v.cClassTrib ?? cClassTribEntrada;
  const memorias = memoriasDoItem(objeto);
  const legais = cClassTrib ? (fundamentacoes ?? []).filter((f) => f.codigoClassificacaoTributaria === cClassTrib) : [];
  const calculado = objeto.estadoItem === "CALCULO_SIMULADO";
  const idDetalhe = `detalhe-item-${objeto.nObj}`;
  return (
    <article className="item-resultado" aria-label={`Item ${objeto.nObj}`}>
      <header>
        <h3>Item {objeto.nObj}</h3>
        {cClassTrib && <span className="dica">cClassTrib {cClassTrib}</span>}
        <span className={`etiqueta ${calculado ? "ok" : "alerta"}`}>{objeto.estadoItem}</span>
      </header>

      {objeto.erros && objeto.erros.length > 0 && (
        <ul className="erros-motor">
          {objeto.erros.map((e, i) => (
            <li key={i}>
              <strong>{e.code}</strong> <span>{e.title}</span>
              <p>{e.detail}</p>
            </li>
          ))}
        </ul>
      )}

      {v.base !== undefined && (
        <div className="tabela-rolagem">
          <table>
            <thead>
              <tr>
                <th scope="col">Base (vBC)</th>
                <th scope="col">CBS (vCBS)</th>
                <th scope="col">IBS estadual</th>
                <th scope="col">IBS municipal</th>
                <th scope="col">IBS total</th>
                {v.is !== undefined && <th scope="col">Imposto Seletivo</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{brl(v.base)}</td>
                <td>{brl(v.cbs)}</td>
                <td>{brl(v.ibsUf)}</td>
                <td>{brl(v.ibsMun)}</td>
                <td>{brl(v.ibs)}</td>
                {v.is !== undefined && <td>{brl(v.is)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {(memorias.length > 0 || legais.length > 0 || calculado) && (
        <>
          <button type="button" className="secundario" aria-expanded={aberto} aria-controls={idDetalhe} onClick={() => setAberto(!aberto)}>
            {aberto ? "▾" : "▸"} Memória de cálculo e fundamentação legal
          </button>
          {aberto && (
            <div id={idDetalhe} className="detalhe-item">
              <h4>Memória de cálculo</h4>
              {memorias.length === 0 && <p className="dica">O motor não devolveu memória de cálculo para este item.</p>}
              {memorias.map((m) => (
                <p key={m.rotulo}>
                  <strong>{m.rotulo}:</strong> {m.texto}
                </p>
              ))}
              <h4>Fundamentação legal</h4>
              {reaberto ? (
                <>
                  {carregandoFundamentacoes && <p className="dica">Consultando fundamentação legal…</p>}
                  {!carregandoFundamentacoes && fundamentacoes === null && (
                    <p className="dica">
                      Não foi possível consultar a fundamentação legal agora (o motor oficial pode estar desligado). Ela não é guardada no
                      cenário; o resultado acima continua válido.
                    </p>
                  )}
                  {!carregandoFundamentacoes && fundamentacoes !== null && (
                    <p className="dica">
                      Fundamentação consultada agora no motor em execução (pode diferir da vigente na data do cálculo).
                    </p>
                  )}
                  {!carregandoFundamentacoes && fundamentacoes !== null && legais.length === 0 && (
                    <p className="dica">Nenhuma fundamentação encontrada para este cClassTrib.</p>
                  )}
                </>
              ) : (
                <>
                {carregandoFundamentacoes && <p className="dica">Carregando fundamentação…</p>}
                {!carregandoFundamentacoes && fundamentacoes === null && (
                  <p className="dica">Fundamentação legal indisponível no momento.</p>
                )}
                {!carregandoFundamentacoes && fundamentacoes !== null && legais.length === 0 && (
                  <p className="dica">Nenhuma fundamentação encontrada para o cClassTrib {cClassTrib ?? "do item"} nesta data.</p>
                )}
                </>
              )}
              {legais.map((f, i) => (
                <div key={i} className="fundamentacao">
                  <p>
                    <strong>{f.textoCurto}</strong> <span className="dica">({f.conjuntoTributo})</span>
                  </p>
                  <p>{f.texto}</p>
                  <p className="dica referencia">{quebrarLinhas(f.referenciaNormativa)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

const presente = (v: unknown) => v !== undefined && v !== null && v !== "";

/** Tributos que foram ao motor com alíquota em algum item (CBS, IBS_UF, IBS_MUN, IS_ADVALOREM, IS_ADREM). */
function tributosEnviados(itens: ItemEntrada[]): string[] {
  const t = new Set<string>();
  for (const i of itens) {
    const a = i.aliquotasNominais;
    if (!a) continue;
    if (presente(a.cbs)) t.add("CBS");
    if (presente(a.ibsEstadual)) t.add("IBS_UF");
    if (presente(a.ibsMunicipal)) t.add("IBS_MUN");
    if (presente(a.impostoSeletivo?.adValorem)) t.add("IS_ADVALOREM");
    if (presente(a.impostoSeletivo?.adRem)) t.add("IS_ADREM");
  }
  return ["CBS", "IBS_UF", "IBS_MUN", "IS_ADVALOREM", "IS_ADREM"].filter((x) => t.has(x));
}

interface Props {
  resposta: RespostaSimulacao;
  /** Fundamentações da data do fato gerador; null quando não foi possível carregá-las. */
  fundamentacoes: Fundamentacao[] | null;
  /** true enquanto a fundamentação ainda está sendo buscada (o resultado já aparece antes dela). */
  carregandoFundamentacoes?: boolean;
  /** Cenário salvo reaberto: a fundamentação é consultada agora (não é guardada) e os textos dizem isso. */
  reaberto?: boolean;
}

export function ResultadoOperacao({ resposta, fundamentacoes, carregandoFundamentacoes = false, reaberto = false }: Props) {
  const totais = totaisDe(resposta.resultado);
  const origens = Object.entries(resposta.origensPremissas ?? {});
  const itensEntrada = resposta.entradaEnviada?.itens ?? [];
  const digitadosSemPremissa = tributosEnviados(itensEntrada).filter((t) => !(t in (resposta.origensPremissas ?? {})));
  return (
    <section aria-label="Resultado da simulação" className="resultado">
      <h2 tabIndex={-1}>Resultado</h2>

      <section aria-label="Totais" className="totais">
        <h3>Totais da operação</h3>
        <dl>
          <div>
            <dt>CBS</dt>
            <dd>{brl(totais.cbs)}</dd>
          </div>
          <div>
            <dt>IBS</dt>
            <dd>{brl(totais.ibs)}</dd>
          </div>
          <div>
            <dt>Imposto Seletivo (IS)</dt>
            <dd>{brl(totais.is)}</dd>
          </div>
          <div>
            <dt>Base de cálculo IBS/CBS</dt>
            <dd>{brl(totais.base)}</dd>
          </div>
        </dl>
        <p className="dica">Valores em reais. Itens com inconsistência não entram nos totais.</p>
      </section>

      <section aria-label="Origem das premissas" className="origens">
        <h3>Origem das alíquotas</h3>
        {origens.length === 0 ? (
          <p className="dica">Nenhuma premissa foi usada: todas as alíquotas foram informadas por você nos itens.</p>
        ) : (
          <>
            <p className="dica">Vieram do conjunto de premissas (em pelo menos um item):</p>
            <ul className="lista-etiquetas">
              {origens.map(([tributo, origem]) => (
                <li key={tributo}>
                  {tributo}: <span className={`etiqueta origem-${origem}`}>{ROTULO_ORIGEM[origem] ?? origem}</span>
                </li>
              ))}
            </ul>
            {digitadosSemPremissa.length > 0 && (
              <p className="dica">Informadas por você em todos os itens: {digitadosSemPremissa.join(", ")}.</p>
            )}
          </>
        )}
      </section>
      <p className="dica motor-usado">Cálculo feito pelo motor oficial do regime regular.</p>

      <h3>Itens</h3>
      {resposta.resultado.objetos.map((o) => (
        <ItemResultado
          key={o.nObj}
          objeto={o}
          cClassTribEntrada={itensEntrada.find((i) => i.numero === o.nObj)?.cClassTrib}
          fundamentacoes={fundamentacoes}
          carregandoFundamentacoes={carregandoFundamentacoes}
          reaberto={reaberto}
        />
      ))}
    </section>
  );
}
