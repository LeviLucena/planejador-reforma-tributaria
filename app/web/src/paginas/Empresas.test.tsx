import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PaginaEmpresas } from "./Empresas";
import { criarServidorFalso, empresaSintetica, resp } from "../test/servidorFalso";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function abrir(servidor: ReturnType<typeof criarServidorFalso>) {
  servidor.instalar();
  render(
    <MemoryRouter>
      <PaginaEmpresas />
    </MemoryRouter>,
  );
  await waitFor(() => expect(servidor.chamadas.some((c) => c.url === "/api/empresas")).toBe(true));
}

function preencher(cnpj = "11.222.333/0001-81") {
  fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "  Padaria Nova Ltda " } });
  fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: cnpj } });
  fireEvent.change(screen.getByLabelText("Regime atual"), { target: { value: "real" } });
  fireEvent.change(screen.getByLabelText("UF"), { target: { value: "SP" } });
  fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "3550308" } });
}

describe("Empresas: cadastro e lista", () => {
  it("(a) cadastra, envia só os 14 dígitos e lista o CNPJ formatado", async () => {
    const s = criarServidorFalso();
    await abrir(s);
    expect(await screen.findByText("Nenhuma empresa cadastrada.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("UF")).getAllByRole("option")).toHaveLength(28);
    const regime = within(screen.getByLabelText("Regime atual"));
    expect(regime.getByRole("option", { name: "Lucro Presumido" })).toBeInTheDocument();
    expect(regime.getByRole("option", { name: "Simples Nacional" })).toBeInTheDocument();
    expect(regime.getByRole("option", { name: "Lucro Real" })).toBeInTheDocument();
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar empresa" }));
    const linha = await screen.findByRole("row", { name: /Padaria Nova Ltda/ });
    expect(within(linha).getByText("11.222.333/0001-81")).toBeInTheDocument();
    expect(within(linha).getByText("Lucro Real")).toBeInTheDocument();
    expect(within(linha).getByText(/SP/)).toBeInTheDocument();
    const post = s.chamadas.find((c) => c.metodo === "POST" && c.url === "/api/empresas")!;
    expect(post.corpo).toEqual({
      razaoSocial: "Padaria Nova Ltda",
      cnpj: "11222333000181",
      regimeAtual: "real",
      uf: "SP",
      municipioIbge: "3550308",
    });
    expect(screen.getByRole("link", { name: "Padaria Nova Ltda" })).toHaveAttribute("href", `/empresas/${s.estado.empresas[0]!.id}`);
  });

  it("aceita CNPJ só com dígitos", async () => {
    const s = criarServidorFalso();
    await abrir(s);
    await screen.findByText("Nenhuma empresa cadastrada.");
    preencher("11222333000181");
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar empresa" }));
    await screen.findByRole("row", { name: /Padaria Nova Ltda/ });
    expect(s.chamadas.find((c) => c.metodo === "POST")!.corpo).toMatchObject({ cnpj: "11222333000181" });
  });

  it("dados inválidos: mensagens do cliente, aria-invalid/aria-describedby e nenhuma chamada POST", async () => {
    const s = criarServidorFalso();
    await abrir(s);
    await screen.findByText("Nenhuma empresa cadastrada.");
    preencher("123");
    fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar empresa" }));
    const cnpj = screen.getByLabelText("CNPJ");
    expect(cnpj).toHaveAttribute("aria-invalid", "true");
    expect(cnpj.getAttribute("aria-describedby")).toContain("emp-cnpj-erro");
    expect(document.getElementById("emp-cnpj-erro")).toHaveTextContent("14 dígitos");
    expect(screen.getByLabelText("Razão social")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Município/)).toHaveAttribute("aria-invalid", "true");
    expect(s.chamadas.filter((c) => c.metodo === "POST")).toHaveLength(0);
  });

  it("erro do servidor (CNPJ duplicado) aparece inline e o formulário continua preenchido", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    s.sobrescritas.set("POST /api/empresas", () => resp(400, { codigo: "ENTRADA_INVALIDA", mensagem: "Já existe uma empresa com este CNPJ." }));
    await abrir(s);
    await screen.findByRole("row", { name: /Comercial Exemplo/ });
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar empresa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma empresa com este CNPJ.");
    expect(screen.getByLabelText("Razão social")).toHaveValue("  Padaria Nova Ltda ");
    expect(screen.queryByRole("row", { name: /Padaria Nova/ })).toBeNull();
  });
});

describe("Empresas: edição e exclusão", () => {
  it("editar envia a substituição completa (PUT com todos os campos)", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    await abrir(s);
    const linha = await screen.findByRole("row", { name: /Comercial Exemplo/ });
    fireEvent.click(within(linha).getByRole("button", { name: "Editar Comercial Exemplo Ltda" }));
    expect(screen.getByLabelText("CNPJ")).toHaveValue("11.222.333/0001-81");
    fireEvent.change(screen.getByLabelText("Razão social"), { target: { value: "Comercial Exemplo S.A." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByRole("row", { name: /Comercial Exemplo S\.A\./ });
    const put = s.chamadas.find((c) => c.metodo === "PUT")!;
    expect(put.url).toBe("/api/empresas/7");
    expect(put.corpo).toEqual({ razaoSocial: "Comercial Exemplo S.A.", cnpj: "11222333000181", regimeAtual: "presumido", uf: "RS", municipioIbge: "4314902" });
  });

  it("excluir pede confirmação inline (sem window.confirm), avisa dos cenários e só então chama DELETE", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    const alertar = vi.spyOn(window, "alert");
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    await abrir(s);
    const linha = await screen.findByRole("row", { name: /Comercial Exemplo/ });
    fireEvent.click(within(linha).getByRole("button", { name: "Excluir Comercial Exemplo Ltda" }));
    expect(screen.getByText(/cenários salvos desta empresa também serão excluídos/)).toBeInTheDocument();
    expect(s.chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(0);
    // Cancelar volta ao normal sem chamar a API.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar exclusão" }));
    expect(screen.queryByText(/cenários salvos desta empresa/)).toBeNull();
    expect(s.chamadas.filter((c) => c.metodo === "DELETE")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Excluir Comercial Exemplo Ltda" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    await screen.findByText("Nenhuma empresa cadastrada.");
    expect(s.chamadas.filter((c) => c.metodo === "DELETE").map((c) => c.url)).toEqual(["/api/empresas/7"]);
    expect(confirmar).not.toHaveBeenCalled();
    expect(alertar).not.toHaveBeenCalled();
  });

  it("falha ao excluir mostra o erro inline e mantém a empresa na lista", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    s.sobrescritas.set("DELETE /api/empresas/7", () => resp(500, { codigo: "ERRO_INTERNO", mensagem: "Falha ao excluir." }));
    await abrir(s);
    const linha = await screen.findByRole("row", { name: /Comercial Exemplo/ });
    fireEvent.click(within(linha).getByRole("button", { name: "Excluir Comercial Exemplo Ltda" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao excluir.");
    expect(screen.getByRole("row", { name: /Comercial Exemplo/ })).toBeInTheDocument();
  });
});
