import { render, screen, within } from "@testing-library/react";
import operacaoOficial from "../exemplos/operacao-oficial.json"; // exemplo oficial da Receita (real)
import respostaOficial from "../test/resposta-oficial.json"; // resposta real do motor
import { ResultadoOperacao } from "./ResultadoOperacao";

// I2: o texto de origem das alíquotas só diz "nenhuma premissa" quando nada foi resolvido,
// e separa o que veio das premissas do que a pessoa digitou. Origens abaixo são substitutos de teste.
function mostrar(origensPremissas: Record<string, string>) {
  render(
    <ResultadoOperacao
      resposta={{ resultado: respostaOficial as never, entradaEnviada: operacaoOficial as never, origensPremissas }}
      fundamentacoes={[]}
    />,
  );
  return within(screen.getByRole("region", { name: "Origem das premissas" }));
}

describe("ResultadoOperacao: origem das alíquotas", () => {
  it("sem nenhuma origem: diz que nenhuma premissa foi usada", () => {
    const r = mostrar({});
    expect(r.getByText("Nenhuma premissa foi usada: todas as alíquotas foram informadas por você nos itens.")).toBeInTheDocument();
  });

  it("misto: só o IS veio das premissas; CBS/IBS aparecem como informadas por você", () => {
    const r = mostrar({ IS_ADVALOREM: "usuario" });
    expect(r.queryByText(/Nenhuma premissa foi usada/)).toBeNull();
    expect(r.getByText(/IS_ADVALOREM/)).toHaveTextContent("IS_ADVALOREM: premissa sua");
    expect(r.getByText("Informadas por você em todos os itens: CBS, IBS_UF, IBS_MUN.")).toBeInTheDocument();
  });

  it("tudo das premissas: não lista tributos digitados", () => {
    const r = mostrar({ CBS: "oficial", IBS_UF: "lei_transicao", IBS_MUN: "lei_transicao", IS_ADVALOREM: "usuario" });
    expect(r.queryByText(/Informadas por você/)).toBeNull();
    expect(r.queryByText(/Nenhuma premissa foi usada/)).toBeNull();
  });

  it("diz qual motor fez o cálculo", () => {
    mostrar({});
    expect(screen.getByText("Cálculo feito pelo motor oficial do regime regular.")).toBeInTheDocument();
  });
});
