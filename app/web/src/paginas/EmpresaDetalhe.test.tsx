import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import operacaoOficial from "../exemplos/operacao-oficial.json"; // exemplo oficial da Receita (real)
import { PaginaEmpresaDetalhe } from "./EmpresaDetalhe";
import { VERSAO_MOTOR, criarServidorFalso, empresaSintetica, resp, type Resp } from "../test/servidorFalso";

// Real: resposta-oficial.json (motor) e operacao-oficial.json (Receita). Sintético: ids, nomes, datas e versaoMotor.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function preparar(entrada = "/empresas/7?cenario=100", conjuntoDoCenario = 2, extras?: (s: ReturnType<typeof criarServidorFalso>) => void) {
  const s = criarServidorFalso({ empresas: [empresaSintetica()] });
  const v1 = s.nova(7, "Venda interestadual", 1, operacaoOficial, conjuntoDoCenario); // id 100
  s.estado.cenarios.push(v1);
  extras?.(s);
  s.instalar();
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/empresas/:id" element={<PaginaEmpresaDetalhe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { s, v1 };
}

const selo = () => screen.getByLabelText("Selo do resultado congelado");

describe("EmpresaDetalhe: reabrir cenário congelado", () => {
  it("(b) mostra o resultado idêntico e o selo, sem chamar simular nem recalcular", async () => {
    const { s } = preparar();
    // Região que só existe depois de carregar: o selo.
    expect(await screen.findByLabelText("Selo do resultado congelado")).toBeInTheDocument();
    expect(selo().textContent).toMatch(
      new RegExp(
        `^Resultado congelado em 18/11/2026,? 12:30 · versão 1 · motor: ${VERSAO_MOTOR.replace(/[+/.]/g, "\\$&")} · premissas: Premissas validadas \\(validado por Ana em 18/11/2026\\)$`,
      ),
    );
    // Totais do motor oficial (strings, sem Number)
    const totais = within(screen.getByLabelText("Totais"));
    expect(totais.getByText("56,76")).toBeInTheDocument();
    expect(totais.getByText("0,64")).toBeInTheDocument();
    expect(totais.getByText("15,00")).toBeInTheDocument();
    // itens calculados e o item com inconsistência REG-011
    expect(screen.getByRole("article", { name: "Item 1" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Item 2" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Item 3" })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Item 4" })).getByText("REG-011")).toBeInTheDocument();
    // origens das premissas guardadas no cenário
    expect(screen.getByLabelText("Origem das premissas")).toHaveTextContent("premissa sua");
    // Reabrir só leu do banco
    const urls = s.chamadas.map((c) => `${c.metodo} ${c.url}`);
    expect(urls).toContain("GET /api/cenarios/100");
    expect(urls.some((u) => u.includes("/api/simular"))).toBe(false);
    expect(urls.some((u) => u.includes("/recalcular"))).toBe(false);
    expect(urls.some((u) => u.startsWith("POST"))).toBe(false);
  });

  it("conjunto pendente de validação aparece no selo", async () => {
    preparar("/empresas/7?cenario=100", 1);
    await screen.findByLabelText("Selo do resultado congelado");
    expect(selo()).toHaveTextContent("premissas: Premissas 2027 (rascunho) (pendente de validação)");
  });

  it("conjunto inexistente: diz 'conjunto #99 não encontrado'", async () => {
    preparar("/empresas/7?cenario=100", 99);
    await screen.findByLabelText("Selo do resultado congelado");
    expect(selo()).toHaveTextContent("premissas: conjunto #99 não encontrado");
  });

  it("mostra os dados da empresa e agrupa os cenários por nome com todas as versões", async () => {
    preparar("/empresas/7", 2, (s) =>
      s.estado.cenarios.push(s.nova(7, "Venda interestadual", 2, operacaoOficial, 2), s.nova(7, "Compra de insumos", 1, operacaoOficial, 2)),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Comercial Exemplo Ltda" })).toBeInTheDocument();
    expect(screen.getByText("11.222.333/0001-81")).toBeInTheDocument();
    expect(screen.getByText("Lucro Presumido")).toBeInTheDocument();
    const lista = await screen.findByRole("list", { name: "Versões de Venda interestadual" });
    expect(within(lista).getAllByRole("button")).toHaveLength(2);
    expect(within(lista).getByText(/criado em 18\/11\/2026,? 12:30/)).toBeInTheDocument();
    expect(within(lista).getAllByText(new RegExp(`motor: ${VERSAO_MOTOR.replace(/[+/.]/g, "\\$&")}`))).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "Versões de Compra de insumos" })).getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByLabelText("Selo do resultado congelado")).toBeNull(); // nada selecionado ainda
  });

  it("empresa inexistente: mensagem de erro", async () => {
    preparar("/empresas/999");
    expect(await screen.findByRole("alert")).toHaveTextContent("Empresa 999 não encontrada.");
  });

  it("troca rápida de versão: a resposta atrasada da versão antiga não sobrescreve a nova", async () => {
    let liberar!: (r: Resp) => void;
    const { s } = preparar("/empresas/7", 2, (srv) => {
      srv.estado.cenarios.push(srv.nova(7, "Venda interestadual", 2, operacaoOficial, 2)); // id 101
      srv.sobrescritas.set("GET /api/cenarios/100", () => new Promise<Resp>((r) => (liberar = r)));
    });
    const lista = await screen.findByRole("list", { name: "Versões de Venda interestadual" });
    fireEvent.click(within(lista).getByRole("button", { name: "Versão 1" })); // pendente
    fireEvent.click(within(lista).getByRole("button", { name: "Versão 2" })); // rápida
    await screen.findByLabelText("Selo do resultado congelado");
    expect(selo()).toHaveTextContent("versão 2");
    await act(async () => {
      liberar(resp(200, s.estado.cenarios[0]));
    });
    expect(selo()).toHaveTextContent("versão 2");
    expect(selo()).not.toHaveTextContent("versão 1");
  });
});

describe("EmpresaDetalhe: recalcular", () => {
  it("(c) cria a versão 2, a seleciona, anuncia e mantém a versão 1 listada e selecionável", async () => {
    const { s } = preparar();
    await screen.findByLabelText("Selo do resultado congelado");
    expect(screen.getByText("Recalcula com as premissas atuais do conjunto e o motor em execução; as versões anteriores não são alteradas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recalcular" }));
    await waitFor(() => expect(selo()).toHaveTextContent("versão 2"));
    expect(screen.getByRole("status")).toHaveTextContent("Nova versão 2 criada para “Venda interestadual”.");
    const post = s.chamadas.find((c) => c.metodo === "POST")!;
    expect(post.url).toBe("/api/cenarios/100/recalcular");
    const lista = screen.getByRole("list", { name: "Versões de Venda interestadual" });
    expect(within(lista).getAllByRole("button")).toHaveLength(2);
    expect(within(lista).getByRole("button", { name: "Versão 2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(lista).getByRole("button", { name: "Versão 1" }));
    await waitFor(() => expect(selo()).toHaveTextContent("versão 1"));
    expect(within(screen.getByLabelText("Totais")).getByText("56,76")).toBeInTheDocument();
    // as duas versões continuam no servidor
    expect(s.estado.cenarios.map((c) => c.versaoNumero)).toEqual([1, 2]);
  });

  it.each([
    ["PREMISSA_AUSENTE", 422, "Falta a premissa de CBS para esta data."],
    ["MOTOR_INDISPONIVEL", 503, "Motores de cálculo indisponíveis."],
    ["ENTRADA_INVALIDA", 400, "Entrada inválida para recalcular."],
  ])("erro %s aparece inline e as versões antigas continuam visíveis", async (codigo, status, mensagem) => {
    const { s } = preparar();
    await screen.findByLabelText("Selo do resultado congelado");
    s.sobrescritas.set("POST /api/cenarios/100/recalcular", () => resp(status, { codigo, mensagem }));
    fireEvent.click(screen.getByRole("button", { name: "Recalcular" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagem);
    expect(selo()).toHaveTextContent("versão 1");
    expect(screen.getByRole("list", { name: "Versões de Venda interestadual" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Totais")).getByText("56,76")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recalcular" })).toBeEnabled();
  });
});

// ---- Base legal ao reabrir (fundamentação consultada agora; não é guardada no cenário) ----
describe("EmpresaDetalhe: fundamentação legal ao reabrir", () => {
  const dataDoExemplo = operacaoOficial.dhFatoGerador.slice(0, 10); // 2027-03-10, do exemplo oficial real
  const rotuloConsultada = "Fundamentação consultada agora no motor em execução (pode diferir da vigente na data do cálculo).";
  const falha = "Não foi possível consultar a fundamentação legal agora (o motor oficial pode estar desligado). Ela não é guardada no cenário; o resultado acima continua válido.";

  async function abrirItem(n: number) {
    const item = await screen.findByRole("article", { name: `Item ${n}` });
    fireEvent.click(within(item).getByRole("button", { name: /Memória de cálculo e fundamentação legal/ }));
    return item;
  }

  it("ao abrir faz só as leituras esperadas e UMA consulta de fundamentação na data do fato gerador", async () => {
    const { s } = preparar();
    await screen.findByLabelText("Selo do resultado congelado");
    await waitFor(() => expect(s.chamadas.some((c) => c.url.startsWith("/api/fundamentacoes"))).toBe(true));
    const urls = s.chamadas.map((c) => `${c.metodo} ${c.url}`);
    expect([...urls].sort()).toEqual(
      [
        "GET /api/empresas/7",
        "GET /api/empresas/7/cenarios",
        "GET /api/premissas/conjuntos",
        "GET /api/cenarios/100",
        `GET /api/fundamentacoes?data=${dataDoExemplo}`,
      ].sort(),
    );
    expect(urls.some((u) => u.includes("/api/classificacoes") || u.includes("/api/simular") || u.includes("/recalcular"))).toBe(false);
    expect(urls.some((u) => u.startsWith("POST"))).toBe(false);
  });

  it("mostra a base legal do cClassTrib do item com o rótulo 'consultada agora'", async () => {
    preparar();
    const item = await abrirItem(1); // cClassTrib 200003
    expect(await within(item).findByText(rotuloConsultada)).toBeInTheDocument();
    expect(within(item).getByText("Art. 125")).toBeInTheDocument(); // textoCurto real do cClassTrib 200003
    expect(within(item).queryByText(/indisponível no momento/)).toBeNull();
  });

  it("cClassTrib sem texto na lista: mensagem própria", async () => {
    const { s } = preparar();
    s.sobrescritas.set(`GET /api/fundamentacoes?data=${dataDoExemplo}`, () => resp(200, []));
    const item = await abrirItem(1);
    expect(await within(item).findByText("Nenhuma fundamentação encontrada para este cClassTrib.")).toBeInTheDocument();
  });

  it.each([
    ["503 MOTOR_INDISPONIVEL", () => resp(503, { codigo: "MOTOR_INDISPONIVEL", mensagem: "fora" })],
    ["rejeição de rede", () => Promise.reject(new TypeError("fail"))],
  ])("falha (%s): o resultado congelado fica completo e aparece a mensagem de falha, não a antiga", async (_nome, falhar) => {
    const { s } = preparar();
    s.sobrescritas.set(`GET /api/fundamentacoes?data=${dataDoExemplo}`, falhar as never);
    const item = await abrirItem(1);
    expect(await within(item).findByText(falha)).toBeInTheDocument();
    expect(screen.queryByText(/indisponível no momento/)).toBeNull();
    expect(selo()).toHaveTextContent("versão 1");
    const totais = within(screen.getByLabelText("Totais"));
    for (const t of ["56,76", "0,64", "15,00"]) expect(totais.getByText(t)).toBeInTheDocument();
    for (const n of [1, 2, 3]) expect(screen.getByRole("article", { name: `Item ${n}` })).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Item 4" })).getByText("REG-011")).toBeInTheDocument();
  });

  it("enquanto consulta mostra 'Consultando…' e o resultado já está na tela", async () => {
    let liberar!: (r: Resp) => void;
    preparar("/empresas/7?cenario=100", 2, (s) =>
      s.sobrescritas.set(`GET /api/fundamentacoes?data=${dataDoExemplo}`, () => new Promise<Resp>((r) => (liberar = r))),
    );
    const item = await abrirItem(1);
    expect(within(screen.getByLabelText("Totais")).getByText("56,76")).toBeInTheDocument();
    expect(within(item).getByText("Consultando fundamentação legal…")).toBeInTheDocument();
    await act(async () => liberar(resp(200, [])));
  });

  it("troca rápida de versões: fundamentação atrasada da versão antiga não aparece na nova", async () => {
    const pendentes: ((r: Resp) => void)[] = [];
    preparar("/empresas/7", 2, (s) => {
      s.estado.cenarios.push(s.nova(7, "Venda interestadual", 2, operacaoOficial, 2)); // id 101
      s.sobrescritas.set(`GET /api/fundamentacoes?data=${dataDoExemplo}`, () => new Promise<Resp>((r) => pendentes.push(r)));
    });
    const lista = await screen.findByRole("list", { name: "Versões de Venda interestadual" });
    fireEvent.click(within(lista).getByRole("button", { name: "Versão 1" }));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    fireEvent.click(within(lista).getByRole("button", { name: "Versão 2" }));
    await waitFor(() => expect(pendentes).toHaveLength(2));
    await waitFor(() => expect(selo()).toHaveTextContent("versão 2"));
    const item = await abrirItem(1);
    // a consulta da versão 2 termina primeiro (vazia); a da versão 1 chega depois com texto
    await act(async () => pendentes[1]!(resp(200, [])));
    await act(async () => pendentes[0]!(resp(200, [{ codigoClassificacaoTributaria: "200003", conjuntoTributo: "CBS", texto: "TEXTO ANTIGO", textoCurto: "ANTIGO", referenciaNormativa: "x" }])));
    expect(within(item).getByText("Nenhuma fundamentação encontrada para este cClassTrib.")).toBeInTheDocument();
    expect(screen.queryByText("ANTIGO")).toBeNull();
  });
});
