import type { PremissasSnapshot } from "../../../server/src/cenarios/repositorio";
import type { ItemEntrada, OperacaoEntrada } from "../../../server/src/dominio/tipos";
import { formatarDecimalBR } from "../formatacao";

// Resumo somente leitura das entradas de um cenário salvo. Tudo é exibido como texto:
// nenhum valor passa por Number (números do JSON viram texto com String, sem arredondar).

const texto = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

const decimal = (v: unknown): string => {
  const t = texto(v);
  return t === undefined ? "—" : formatarDecimalBR(t);
};

const presente = (v: unknown) => v !== undefined && v !== null && v !== "";

/** "2027-03-10T10:00:00-03:00" -> "10/03/2027 10:00:00 (-03:00)"; outro texto volta como está. */
export function dataHoraDoFato(iso: unknown): string {
  const t = texto(iso);
  if (t === undefined) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}(?::\d{2})?)(.*)$/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}${m[5] ? ` (${m[5]})` : ""}` : t;
}

type CampoAliquota = "cbs" | "ibsEstadual" | "ibsMunicipal" | "adValorem" | "adRem";

function valorAliquota(item: ItemEntrada | undefined, campo: CampoAliquota): unknown {
  const a = item?.aliquotasNominais as Record<string, unknown> | undefined;
  if (campo === "adValorem" || campo === "adRem") {
    return (a?.impostoSeletivo as Record<string, unknown> | undefined)?.[campo];
  }
  return a?.[campo];
}

const ROTULOS_ALIQUOTA: [CampoAliquota, string][] = [
  ["cbs", "CBS"],
  ["ibsEstadual", "IBS estadual"],
  ["ibsMunicipal", "IBS municipal"],
  ["adValorem", "IS ad valorem"],
  ["adRem", "IS ad rem"],
];

function Aliquotas({ digitado, enviado }: { digitado: ItemEntrada | undefined; enviado: ItemEntrada | undefined }) {
  const linhas = ROTULOS_ALIQUOTA.filter(([campo]) => presente(valorAliquota(enviado, campo)));
  if (linhas.length === 0) return <p className="dica">Nenhuma alíquota foi enviada ao motor para este item.</p>;
  return (
    <ul className="lista-aliquotas">
      {linhas.map(([campo, rotulo]) => {
        const daPremissa = !presente(valorAliquota(digitado, campo));
        return (
          <li key={campo}>
            {rotulo}: {decimal(valorAliquota(enviado, campo))}%{" "}
            <span className={`etiqueta ${daPremissa ? "origem-premissa" : "origem-digitada"}`}>
              {daPremissa ? "da premissa" : "informada por você"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  /** A operação como a pessoa digitou (antes do preenchimento por premissas). */
  entrada: OperacaoEntrada;
  /** O que foi de fato ao motor (alíquotas já preenchidas). */
  entradaEnviada: OperacaoEntrada;
  snapshot: PremissasSnapshot | null;
}

export function ResumoEntradas({ entrada, entradaEnviada, snapshot }: Props) {
  const op = entradaEnviada ?? entrada;
  const itens = op?.itens ?? [];
  return (
    <section aria-label="Entradas do cenário" className="bloco resumo-entradas">
      <h3>Entradas usadas neste cálculo</h3>
      <dl className="dados-empresa">
        <div>
          <dt>UF</dt>
          <dd>{texto(op?.uf) ?? "—"}</dd>
        </div>
        <div>
          <dt>Município (IBGE)</dt>
          <dd>{texto(op?.municipio) ?? "—"}</dd>
        </div>
        <div>
          <dt>Data/hora do fato gerador</dt>
          <dd>{dataHoraDoFato(op?.dhFatoGerador)}</dd>
        </div>
        <div>
          <dt>Conjunto de premissas</dt>
          <dd>{snapshot ? snapshot.conjunto.nome : "snapshot das premissas não disponível (cenário antigo)"}</dd>
        </div>
      </dl>
      {itens.map((enviado, i) => {
        const digitado = entrada?.itens?.find((x) => x.numero === enviado.numero) ?? entrada?.itens?.[i];
        const is = enviado.impostoSeletivo;
        return (
          <article key={`${enviado.numero}-${i}`} aria-label={`Entrada do item ${enviado.numero}`} className="item-entrada">
            <h4>Item {enviado.numero}</h4>
            <p>
              {enviado.ncm !== undefined && <>NCM {texto(enviado.ncm)} · </>}
              {enviado.nbs !== undefined && <>NBS {texto(enviado.nbs)} · </>}
              CST {texto(enviado.cst) ?? "—"} · cClassTrib {texto(enviado.cClassTrib) ?? "—"}
              {presente(enviado.baseCalculo) && <> · base {decimal(enviado.baseCalculo)}</>}
              {presente(enviado.quantidade) && (
                <>
                  {" "}
                  · quantidade {decimal(enviado.quantidade)}
                  {presente(enviado.unidade) && <> {texto(enviado.unidade)}</>}
                </>
              )}
            </p>
            {is && (
              <p>
                Imposto Seletivo: CST {texto(is.cst) ?? "—"} · cClassTrib {texto(is.cClassTrib) ?? "—"}
                {presente(is.baseCalculo) && <> · base {decimal(is.baseCalculo)}</>}
                {presente(is.quantidade) && (
                  <>
                    {" "}
                    · quantidade {decimal(is.quantidade)}
                    {presente(is.unidade) && <> {texto(is.unidade)}</>}
                  </>
                )}
                {presente(is.impostoInformado) && <> · imposto informado {decimal(is.impostoInformado)}</>}
              </p>
            )}
            <Aliquotas digitado={digitado} enviado={enviado} />
          </article>
        );
      })}
    </section>
  );
}
