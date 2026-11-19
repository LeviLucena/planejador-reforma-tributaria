import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { criarServidorFalso, empresaSintetica, resp, VERSAO_MOTOR, type Resp } from "../test/servidorFalso";

// Real: exemplo oficial da Receita (carregado pelo botão do Simulador) e resposta-oficial.json do motor.
// Sintético: empresa, nomes de cenário, ids, datas e versaoMotor do servidor falso.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function abrirApp(s: ReturnType<typeof criarServidorFalso>) {
  s.instalar();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

async function simularExemplo() {
  await screen.findByRole("option", { name: /Premissas 2027/ });
  fireEvent.click(screen.getByRole("button", { name: "Carregar exemplo oficial da Receita" }));
  await screen.findByRole("group", { name: "Item 4" });
  fireEvent.click(screen.getByRole("button", { name: "Simular" }));
  await screen.findByRole("region", { name: "Resultado da simulação" });
}

const painel = () => screen.findByRole("region", { name: "Salvar como cenário" });

async function salvar(nome: string, empresa = "7") {
  const p = await painel();
  await waitFor(() => expect(within(p).getByRole("option", { name: /Comercial Exemplo/ })).toBeInTheDocument());
  fireEvent.change(within(p).getByLabelText("Empresa"), { target: { value: empresa } });
  fireEvent.change(within(p).getByLabelText("Nome do cenário"), { target: { value: nome } });
  fireEvent.click(within(p).getByRole("button", { name: "Salvar cenário" }));
}

describe("Simulador: salvar como cenário", () => {
  it("(b) salva a operação simulada, mostra o link, reabre o resultado idêntico sem simular nem recalcular", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    const simulacao = s.chamadas.find((c) => c.url === "/api/simular")!.corpo as { operacao: unknown; conjuntoPremissasId: number };
    await salvar("  Venda interestadual ");
    const link = await screen.findByRole("link", { name: "Abrir o cenário salvo" });
    const post = s.chamadas.find((c) => c.metodo === "POST" && c.url === "/api/empresas/7/cenarios")!;
    expect(post.corpo).toEqual({ nome: "Venda interestadual", operacao: simulacao.operacao, conjuntoPremissasId: simulacao.conjuntoPremissasId });
    expect(link).toHaveAttribute("href", `/empresas/7?cenario=${s.estado.cenarios[0]!.id}`);
    // O cliente não chama /api/simular de novo: quem executa de novo no motor é o servidor, no POST /cenarios.
    expect(s.chamadas.filter((c) => c.url === "/api/simular")).toHaveLength(1);

    const antes = s.chamadas.length;
    fireEvent.click(link);
    const selo = await screen.findByLabelText("Selo do resultado congelado");
    expect(selo).toHaveTextContent(`motor: ${VERSAO_MOTOR}`);
    expect(selo).toHaveTextContent("premissas: Premissas 2027 (rascunho) (pendente de validação)");
    const totais = within(screen.getByLabelText("Totais"));
    expect(totais.getByText("56,76")).toBeInTheDocument();
    expect(totais.getByText("0,64")).toBeInTheDocument();
    expect(totais.getByText("15,00")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Item 4" })).getByText("REG-011")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Item 1" })).toBeInTheDocument();
    const depois = s.chamadas.slice(antes).map((c) => `${c.metodo} ${c.url}`);
    expect(depois.some((u) => u.includes("/api/simular") || u.includes("/recalcular"))).toBe(false);
    expect(s.chamadas.filter((c) => c.url === "/api/simular")).toHaveLength(1);
  });

  it("se o formulário mudou depois de simular, salva a operação SIMULADA e avisa isso no painel", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    const simulacao = s.chamadas.find((c) => c.url === "/api/simular")!.corpo as { operacao: { municipio: number; uf: string } };
    expect(simulacao.operacao.municipio).toBe(4314902);
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "3550308" } });
    fireEvent.change(screen.getByLabelText("UF"), { target: { value: "SP" } });
    const p = await painel();
    expect(p).toHaveTextContent("mesmo que você altere o formulário");
    expect(p).toHaveTextContent("é executada de novo no motor com as premissas atuais");
    expect(p).not.toHaveTextContent("Salvar não recalcula nada");
    await salvar("Cenário editado depois");
    await screen.findByRole("link", { name: "Abrir o cenário salvo" });
    const post = s.chamadas.find((c) => c.metodo === "POST" && c.url === "/api/empresas/7/cenarios")!.corpo as { operacao: { municipio: number; uf: string } };
    expect(post.operacao.municipio).toBe(4314902);
    expect(post.operacao.uf).toBe("RS");
  });

  it("nome repetido mostra a mensagem do servidor (Recalcular ou outro nome) e não mostra o link", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    await salvar("Venda");
    await screen.findByRole("link", { name: "Abrir o cenário salvo" });
    const p = await painel();
    fireEvent.change(within(p).getByLabelText("Nome do cenário"), { target: { value: "Venda" } });
    fireEvent.click(within(p).getByRole("button", { name: "Salvar cenário" }));
    expect(await within(p).findByRole("alert")).toHaveTextContent("Use Recalcular ou escolha outro nome.");
    expect(screen.queryByRole("link", { name: "Abrir o cenário salvo" })).toBeNull();
  });

  it("nome em branco e empresa não escolhida: mensagem e nenhum POST", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    const p = await painel();
    await within(p).findByRole("option", { name: /Comercial Exemplo/ });
    fireEvent.change(within(p).getByLabelText("Nome do cenário"), { target: { value: "   " } });
    fireEvent.click(within(p).getByRole("button", { name: "Salvar cenário" }));
    expect(within(p).getByLabelText("Nome do cenário")).toHaveAttribute("aria-invalid", "true");
    expect(within(p).getByLabelText("Empresa")).toHaveAttribute("aria-invalid", "true");
    expect(s.chamadas.filter((c) => c.metodo === "POST" && c.url.includes("/cenarios"))).toHaveLength(0);
  });

  it("sem empresas: mensagem com link para /empresas e sem botão de salvar", async () => {
    const s = criarServidorFalso();
    abrirApp(s);
    await simularExemplo();
    const p = await painel();
    expect(await within(p).findByText(/Cadastre uma empresa/)).toBeInTheDocument();
    expect(within(p).getByRole("link", { name: "Empresas" })).toHaveAttribute("href", "/empresas");
    expect(within(p).queryByRole("button", { name: "Salvar cenário" })).toBeNull();
  });

  it("o painel não existe antes de simular, some enquanto simula e some se a nova simulação falha", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await screen.findByRole("option", { name: /Premissas 2027/ });
    expect(screen.queryByRole("region", { name: "Salvar como cenário" })).toBeNull();
    await simularExemplo();
    await painel();
    // nova simulação pendente: o painel some enquanto roda
    let liberar!: (r: Resp) => void;
    s.sobrescritas.set("POST /api/simular", () => new Promise<Resp>((r) => (liberar = r)));
    fireEvent.click(screen.getByRole("button", { name: "Simular" }));
    await screen.findByRole("button", { name: "Simulando…" });
    expect(screen.queryByRole("region", { name: "Salvar como cenário" })).toBeNull();
    // ela falha: continua sem painel
    liberar(resp(503, { codigo: "MOTOR_INDISPONIVEL", mensagem: "Motores fora do ar." }));
    await screen.findByText(/Os motores de cálculo não estão em execução/);
    expect(screen.queryByRole("region", { name: "Salvar como cenário" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Resultado da simulação" })).toBeNull();
  });
});

describe("Simulador: o que salvar grava (I1) e empresa do Simples (I3)", () => {
  it("mostra os totais gravados pelo servidor; iguais aos exibidos, sem aviso de divergência", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    await salvar("Base");
    await screen.findByRole("link", { name: "Abrir o cenário salvo" });
    const p = await painel();
    expect(within(p).getByLabelText("Totais salvos")).toHaveTextContent("Totais gravados: CBS 56,76 · IBS 0,64 · IS 15,00");
    expect(within(p).queryByText(/O resultado salvo difere do exibido acima/)).toBeNull();
  });

  it("se o servidor gravar totais diferentes dos exibidos, avisa", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    // SUBSTITUTO DE TESTE: resultado gravado com a CBS total alterada (simula premissa/motor que mudou).
    s.sobrescritas.set("POST /api/empresas/7/cenarios", (corpo) => {
      const c = s.nova(7, (corpo as { nome: string }).nome, 1, (corpo as { operacao: unknown }).operacao, 1);
      const resultado = structuredClone(c.resultado) as { total: { tribCalc: { IBSCBSTot: { gCBS: { vCBS: string } } } } };
      resultado.total.tribCalc.IBSCBSTot.gCBS.vCBS = "60.00";
      return resp(201, { ...c, resultado });
    });
    abrirApp(s);
    await simularExemplo();
    await salvar("Base");
    const p = await painel();
    expect(await within(p).findByText("O resultado salvo difere do exibido acima (premissas ou motor mudaram desde a simulação).")).toBeInTheDocument();
    expect(within(p).getByLabelText("Totais salvos")).toHaveTextContent("CBS 60,00");
  });

  it("empresa optante pelo Simples: alerta de que o cálculo é do regime regular", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica({ regimeAtual: "simples" })] });
    abrirApp(s);
    await simularExemplo();
    const p = await painel();
    await waitFor(() => expect(within(p).getByRole("option", { name: /Comercial Exemplo/ })).toBeInTheDocument());
    expect(within(p).queryByRole("alert")).toBeNull();
    fireEvent.change(within(p).getByLabelText("Empresa"), { target: { value: "7" } });
    expect(within(p).getByRole("alert")).toHaveTextContent(
      "Esta empresa é optante pelo Simples Nacional. Nesta fase o cálculo usa o motor do regime regular e NÃO representa a apuração do Simples.",
    );
  });

  it("o resultado do Simulador diz que o cálculo é do motor do regime regular", async () => {
    const s = criarServidorFalso({ empresas: [empresaSintetica()] });
    abrirApp(s);
    await simularExemplo();
    expect(
      within(screen.getByRole("region", { name: "Resultado da simulação" })).getByText("Cálculo feito pelo motor oficial do regime regular."),
    ).toBeInTheDocument();
  });
});
