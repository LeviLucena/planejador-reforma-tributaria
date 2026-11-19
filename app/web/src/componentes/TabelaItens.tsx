import type { SituacaoTributaria } from "../../../server/src/dominio/tipos";
import type { ItemForm } from "../simulador/modelo";
import { Campo } from "./Campo";

interface Props {
  itens: ItemForm[];
  /** Lista de CST/cClassTrib vinda da API; vazia = o campo vira texto livre. */
  situacoes: SituacaoTributaria[];
  erros: Record<string, string>;
  onMudar: (chave: number, mudanca: Partial<ItemForm>) => void;
  onAdicionar: () => void;
  onRemover: (chave: number) => void;
}

const temValorIS = (it: ItemForm) =>
  [it.isCst, it.isCClassTrib, it.isBaseCalculo, it.isQuantidade, it.isUnidade, it.isImpostoInformado, it.isAdValorem].some(
    (v) => v.trim() !== "",
  );

export function TabelaItens({ itens, situacoes, erros, onMudar, onAdicionar, onRemover }: Props) {
  const temLista = situacoes.length > 0;
  return (
    <div className="itens">
      {erros.itens && (
        <p className="erro-campo" role="alert">
          {erros.itens}
        </p>
      )}
      {itens.map((it, pos) => {
        const k = `i${it.chave}`;
        const e = (campo: string) => erros[`${k}.${campo}`];
        const texto = (campo: keyof ItemForm) => ({
          value: it[campo] as string,
          onChange: (ev: { target: { value: string } }) => onMudar(it.chave, { [campo]: ev.target.value }),
        });
        const classes = situacoes.find((s) => s.codigo === it.cst)?.classificacoesTributarias ?? [];
        const classeFora = it.cClassTrib !== "" && !classes.some((c) => c.codigo === it.cClassTrib);
        const nome = it.tipoCodigo === "ncm" ? "NCM" : "NBS";
        return (
          <fieldset key={it.chave} className="item-form">
            <legend>Item {pos + 1}</legend>
            <div className="grade">
              <Campo id={`${k}-tipo`} rotulo="Tipo de código">
                {(a) => (
                  <select {...a} value={it.tipoCodigo} onChange={(ev) => onMudar(it.chave, { tipoCodigo: ev.target.value as "ncm" | "nbs" })}>
                    <option value="ncm">NCM (8 dígitos)</option>
                    <option value="nbs">NBS (9 dígitos)</option>
                  </select>
                )}
              </Campo>
              <Campo id={`${k}-codigo`} rotulo={`Código ${nome}`} erro={e("codigo")} dica={it.tipoCodigo === "ncm" ? "Mercadoria: 8 dígitos." : "Serviço: 9 dígitos."}>
                {(a) => <input {...a} inputMode="numeric" maxLength={9} {...texto("codigo")} />}
              </Campo>
              <Campo id={`${k}-cst`} rotulo="CST" erro={e("cst")}>
                {(a) =>
                  temLista ? (
                    <select
                      {...a}
                      value={it.cst}
                      onChange={(ev) => {
                        const novo = situacoes.find((s) => s.codigo === ev.target.value);
                        const mantem = novo?.classificacoesTributarias.some((c) => c.codigo === it.cClassTrib);
                        onMudar(it.chave, { cst: ev.target.value, ...(mantem ? {} : { cClassTrib: "" }) });
                      }}
                    >
                      <option value="">Selecione</option>
                      {it.cst !== "" && !situacoes.some((s) => s.codigo === it.cst) && <option value={it.cst}>{it.cst}</option>}
                      {situacoes.map((s) => (
                        <option key={s.codigo} value={s.codigo}>
                          {s.codigo} — {s.descricao}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input {...a} inputMode="numeric" maxLength={3} {...texto("cst")} />
                  )
                }
              </Campo>
              <Campo id={`${k}-cclasstrib`} rotulo="cClassTrib" erro={e("cClassTrib")}>
                {(a) =>
                  temLista ? (
                    <select {...a} value={it.cClassTrib} onChange={(ev) => onMudar(it.chave, { cClassTrib: ev.target.value })}>
                      <option value="">{it.cst === "" ? "Escolha o CST primeiro" : "Selecione"}</option>
                      {classeFora && <option value={it.cClassTrib}>{it.cClassTrib}</option>}
                      {classes.map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.codigo} — {c.descricao}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input {...a} inputMode="numeric" maxLength={6} {...texto("cClassTrib")} />
                  )
                }
              </Campo>
              <Campo id={`${k}-base`} rotulo="Base de cálculo" erro={e("baseCalculo")} dica="Em reais; opcional se houver quantidade.">
                {(a) => <input {...a} inputMode="decimal" {...texto("baseCalculo")} />}
              </Campo>
              <Campo id={`${k}-qtd`} rotulo="Quantidade" erro={e("quantidade")}>
                {(a) => <input {...a} inputMode="decimal" {...texto("quantidade")} />}
              </Campo>
              <Campo id={`${k}-un`} rotulo="Unidade" dica="Ex.: KG, LT, UN.">
                {(a) => <input {...a} maxLength={6} {...texto("unidade")} />}
              </Campo>
            </div>

            <p className="dica">Alíquotas próprias (%): deixe em branco para usar as premissas.</p>
            <div className="grade">
              <Campo id={`${k}-cbs`} rotulo="Alíquota CBS (%)" erro={e("cbs")}>
                {(a) => <input {...a} inputMode="decimal" placeholder="usar as premissas" {...texto("cbs")} />}
              </Campo>
              <Campo id={`${k}-ibsuf`} rotulo="Alíquota IBS estadual (%)" erro={e("ibsEstadual")}>
                {(a) => <input {...a} inputMode="decimal" placeholder="usar as premissas" {...texto("ibsEstadual")} />}
              </Campo>
              <Campo id={`${k}-ibsmun`} rotulo="Alíquota IBS municipal (%)" erro={e("ibsMunicipal")}>
                {(a) => <input {...a} inputMode="decimal" placeholder="usar as premissas" {...texto("ibsMunicipal")} />}
              </Campo>
            </div>

            <details open={it.isAberto} onToggle={(ev) => onMudar(it.chave, { isAberto: (ev.currentTarget as HTMLDetailsElement).open })}>
              <summary>
                Imposto Seletivo (opcional)
                {!it.isAberto && temValorIS(it) && (
                  <span className="dica">
                    {" "}
                    — valores digitados neste bloco não serão enviados enquanto ele estiver recolhido
                  </span>
                )}
              </summary>
              <div className="grade">
                <Campo id={`${k}-iscst`} rotulo="CST do IS" erro={e("isCst")}>
                  {(a) => <input {...a} inputMode="numeric" maxLength={3} {...texto("isCst")} />}
                </Campo>
                <Campo id={`${k}-iscclass`} rotulo="cClassTrib do IS" erro={e("isCClassTrib")}>
                  {(a) => <input {...a} inputMode="numeric" maxLength={6} {...texto("isCClassTrib")} />}
                </Campo>
                <Campo id={`${k}-isbase`} rotulo="Base de cálculo (IS)" erro={e("isBaseCalculo")}>
                  {(a) => <input {...a} inputMode="decimal" {...texto("isBaseCalculo")} />}
                </Campo>
                <Campo id={`${k}-isqtd`} rotulo="Quantidade (IS)" erro={e("isQuantidade")}>
                  {(a) => <input {...a} inputMode="decimal" {...texto("isQuantidade")} />}
                </Campo>
                <Campo id={`${k}-isun`} rotulo="Unidade (IS)">
                  {(a) => <input {...a} maxLength={6} {...texto("isUnidade")} />}
                </Campo>
                <Campo id={`${k}-isinf`} rotulo="Imposto informado" erro={e("isImpostoInformado")}>
                  {(a) => <input {...a} inputMode="decimal" {...texto("isImpostoInformado")} />}
                </Campo>
                <Campo id={`${k}-isad`} rotulo="Alíquota ad valorem (%)" erro={e("isAdValorem")}>
                  {(a) => <input {...a} inputMode="decimal" placeholder="usar as premissas" {...texto("isAdValorem")} />}
                </Campo>
              </div>
            </details>

            <button type="button" className="secundario" onClick={() => onRemover(it.chave)}>
              Remover item {pos + 1}
            </button>
          </fieldset>
        );
      })}
      <button type="button" className="secundario" onClick={onAdicionar}>
        Adicionar item
      </button>
    </div>
  );
}
