import { render, screen } from "@testing-library/react";
import { AvisoSimulacao } from "./AvisoSimulacao";

describe("AvisoSimulacao", () => {
  it("mostra o texto exato do aviso", () => {
    render(<AvisoSimulacao />);
    expect(screen.getByText("Simulação — não substitui a apuração dos tributos.")).toBeInTheDocument();
  });
});
