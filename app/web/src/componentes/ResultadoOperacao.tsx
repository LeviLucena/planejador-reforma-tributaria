import { useState } from "react";
import type { Fundamentacao, ObjetoResultado } from "../../../server/src/dominio/tipos";
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
}

function ItemResultado({ objeto, cClassTribEntrada, fundamentacoes, carregandoFundamentacoes }: PropsItem) {
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
              {carregandoFundamentacoes && <p className="dica">Carregando fundamentação…</p>}
              {!carregandoFundamentacoes && fundamentacoes === null && (
                <p className="dica">Fundamentação legal indisponível no momento.</p>
              )}
              {!carregandoFundamentacoes && fundamentacoes !== null && legais.length === 0 && (
                <p className="dica">Nenhuma fundamentação encontrada para o cClassTrib {cClassTrib ?? "do item"} nesta data.</p>
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

interface Props {
  resposta: RespostaSimulacao;
  /** Fundamentações da data do fato gerador; null quando não foi possível carregá-las. */
  fundamentacoes: Fundamentacao[] | null;
  /** true enquanto a fundamentação ainda está sendo buscada (o resultado já aparece antes dela). */
  carregandoFundamentacoes?: boolean;
}

export function ResultadoOperacao({ resposta, fundamentacoes, carregandoFundamentacoes = false }: Props) {
  const totais = totaisDe(resposta.resultado);
  const origens = Object.entries(resposta.origensPremissas ?? {});
  const itensEntrada = resposta.entradaEnviada?.itens ?? [];
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
          <ul className="lista-etiquetas">
            {origens.map(([tributo, origem]) => (
              <li key={tributo}>
                {tributo}: <span className={`etiqueta origem-${origem}`}>{ROTULO_ORIGEM[origem] ?? origem}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h3>Itens</h3>
      {resposta.resultado.objetos.map((o) => (
        <ItemResultado
          key={o.nObj}
          objeto={o}
          cClassTribEntrada={itensEntrada.find((i) => i.numero === o.nObj)?.cClassTrib}
          fundamentacoes={fundamentacoes}
          carregandoFundamentacoes={carregandoFundamentacoes}
        />
      ))}
    </section>
  );
}
