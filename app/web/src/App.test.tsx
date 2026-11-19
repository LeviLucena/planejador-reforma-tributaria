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

describe("Navegação: Empresas", () => {
  it("tem o link Empresas e abre a página em /empresas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "[]" }));
    render(
      <MemoryRouter initialEntries={["/empresas"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Empresas" })).toHaveAttribute("href", "/empresas");
    expect(await screen.findByRole("heading", { level: 1, name: "Empresas" })).toBeInTheDocument();
    expect(await screen.findByText("Nenhuma empresa cadastrada.")).toBeInTheDocument();
  });
});
