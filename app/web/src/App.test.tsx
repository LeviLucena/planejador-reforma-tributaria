import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("Layout", () => {
  it("mostra o aviso e o Simulador em /", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "[]" }));
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText("Simulação — não substitui a apuração dos tributos.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Simulador de operação" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Simulador" })).toBeInTheDocument();
  });
});
