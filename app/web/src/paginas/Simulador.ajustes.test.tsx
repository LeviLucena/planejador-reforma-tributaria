import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PaginaSimulador } from "./Simulador";
import classificacoes from "../test/classificacoes-amostra.json"; // amostra real do motor, truncada
import fundamentacoes from "../test/fundamentacoes-amostra.json"; // amostra real do motor, truncada
import respostaOficial from "../test/resposta-oficial.json"; // resposta real do motor (fixture oficial)

const conjuntos = [
  { id: 1, nome: "Premissas 2027 (rascunho)", vigenciaInicio: "2027-01-01", vigenciaFim: null, observacao: null, validadoPor: null, validadoEm: null, linhas: 4 },
];

function resp(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo) };
}

type Opcional = "falha" | "pendente";

function stub(opcoes: { classificacoes?: Opcional; fundamentacoes?: Opcional; entradaEnviada?: unknown } = {}) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      if (url.startsWith("/api/premissas/conjuntos")) return resp(200, conjuntos);
      if (url.startsWith("/api/classificacoes")) {
        if (opcoes.classificacoes === "falha") return resp(500, { codigo: "ERRO_INTERNO", mensagem: "Erro interno." });
        return resp(200, classificacoes);
      }
      if (url.startsWith("/api/fundamentacoes")) {
        if (opcoes.fundamentacoes === "falha") return resp(503, { codigo: "MOTOR_INDISPONIVEL", mensagem: "Motor fora." });
        if (opcoes.fundamentacoes === "pendente") return new Promise(() => {});
        return resp(200, fundamentacoes);
      }
      if (url === "/api/simular") {
        return resp(200, { resultado: respostaOficial, entradaEnviada: opcoes.entradaEnviada ?? {}, origensPremissas: {} });
      }
      return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "x" });
    }),
  );
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

async function abrir() {
  render(<PaginaSimulador />);
  await screen.findByRole("option", { name: /Premissas 2027/ });
}

async function carregarExemplo() {
  fireEvent.click(screen.getByRole("button", { name: "Carregar exemplo oficial da Receita" }));
  await screen.findByRole("group", { name: "Item 4" });
}

const simular = () => fireEvent.click(screen.getByRole("button", { name: "Simular" }));

function corpoEnviado(chamadas: { url: string; init?: RequestInit }[]) {
  const envios = chamadas.filter((c) => c.url === "/api/simular");
  return JSON.parse(envios[envios.length - 1]!.init!.body as string);
}

function alternarDetalhes(detalhes: HTMLDetailsElement, aberto: boolean) {
  detalhes.open = aberto;
  fireEvent(detalhes, new Event("toggle"));
}

describe("ajustes da revisão do Task 12", () => {
  it("o fato gerador sai em -03:00 mesmo com o fuso do processo em outro lugar, e o campo diz 'horário de Brasília'", async () => {
    const fusoOriginal = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      const chamadas = stub();
      await abrir();
      expect(screen.getByLabelText(/horário de Brasília/)).toBeInTheDocument();
      await carregarExemplo();
      simular();
      await screen.findByRole("region", { name: "Totais" });
      expect(corpoEnviado(chamadas).operacao.dhFatoGerador).toBe("2027-03-10T10:00:00-03:00");
    } finally {
      if (fusoOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = fusoOriginal;
    }
  });

  it("Imposto Seletivo recolhido não é enviado (nem a alíquota ad valorem)", async () => {
    const chamadas = stub();
    await abrir();
    await carregarExemplo();
    const detalhes = screen.getByRole("group", { name: "Item 2" }).querySelector("details")!;
    expect(detalhes.open).toBe(true);
    alternarDetalhes(detalhes, false);
    simular();
    await screen.findByRole("region", { name: "Totais" });
    const item2 = corpoEnviado(chamadas).operacao.itens[1];
    expect(item2.impostoSeletivo).toBeUndefined();
    expect(item2.aliquotasNominais?.impostoSeletivo).toBeUndefined();
  });

  it("Imposto Seletivo aberto: vai só se tiver CST, cClassTrib ou algum valor", async () => {
    const chamadas = stub();
    await abrir();
    fireEvent.change(screen.getByLabelText("UF"), { target: { value: "RS" } });
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "4314902" } });
    const item = screen.getByRole("group", { name: "Item 1" });
    fireEvent.change(within(item).getByLabelText("Código NCM"), { target: { value: "10063021" } });
    fireEvent.change(within(item).getByLabelText("CST"), { target: { value: "200" } });
    fireEvent.change(within(item).getByLabelText("cClassTrib"), { target: { value: "200003" } });
    alternarDetalhes(item.querySelector("details")!, true);
    simular(); // aberto, mas vazio
    await screen.findByRole("region", { name: "Totais" });
    expect(corpoEnviado(chamadas).operacao.itens[0].impostoSeletivo).toBeUndefined();

    fireEvent.change(within(item).getByLabelText("Imposto informado"), { target: { value: "15" } });
    chamadas.length = 0;
    simular();
    await waitFor(() => expect(chamadas.some((c) => c.url === "/api/simular")).toBe(true));
    expect(corpoEnviado(chamadas).operacao.itens[0].impostoSeletivo).toEqual({ impostoInformado: "15" });
  });

  it("após validação com erro, o foco vai para o primeiro campo inválido", async () => {
    stub();
    await abrir();
    simular();
    await waitFor(() => expect(screen.getByLabelText("UF")).toHaveFocus());
    expect(screen.getByLabelText("UF")).toHaveAttribute("aria-invalid", "true");
  });

  it("após simular com sucesso, o foco vai para o título do resultado", async () => {
    stub();
    await abrir();
    await carregarExemplo();
    simular();
    const titulo = await screen.findByRole("heading", { level: 2, name: "Resultado" });
    expect(titulo).toHaveAttribute("tabindex", "-1");
    await waitFor(() => expect(titulo).toHaveFocus());
  });

  it("se /api/classificacoes falha, avisa que as listas não carregaram e que os códigos são digitados à mão", async () => {
    stub({ classificacoes: "falha" });
    await abrir();
    expect(await screen.findByText(/Não foi possível carregar as listas de CST e cClassTrib/)).toBeInTheDocument();
    expect(screen.getByText(/Digite os códigos à mão/)).toBeInTheDocument();
  });

  it("o resultado aparece sem esperar a fundamentação, que mostra 'Carregando fundamentação…'", async () => {
    stub({ fundamentacoes: "pendente" });
    await abrir();
    await carregarExemplo();
    simular();
    const i3 = await screen.findByRole("article", { name: "Item 3" });
    fireEvent.click(within(i3).getByRole("button", { name: /Memória de cálculo e fundamentação legal/ }));
    expect(within(i3).getByText("Carregando fundamentação…")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Totais" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular" })).toBeEnabled();
  });

  it("se a fundamentação falha, o resultado continua e o item diz 'indisponível'", async () => {
    stub({ fundamentacoes: "falha" });
    await abrir();
    await carregarExemplo();
    simular();
    const i3 = await screen.findByRole("article", { name: "Item 3" });
    fireEvent.click(within(i3).getByRole("button", { name: /Memória de cálculo e fundamentação legal/ }));
    await waitFor(() => expect(within(i3).getByText("Fundamentação legal indisponível no momento.")).toBeInTheDocument());
    expect(within(i3).queryByText("Carregando fundamentação…")).not.toBeInTheDocument();
  });

  it("item com erro do motor usa o cClassTrib da entrada enviada como alternativa", async () => {
    const item4 = (respostaOficial as { objetos: { nObj: number }[] }).objetos.find((o) => o.nObj === 4)!;
    expect(JSON.stringify(item4)).not.toMatch(/"cClassTrib":"200003"/);
    stub({ entradaEnviada: { itens: [{ numero: 4, cClassTrib: "200003" }] } });
    await abrir();
    await carregarExemplo();
    simular();
    const i4 = await screen.findByRole("article", { name: "Item 4" });
    expect(within(i4).getByText("cClassTrib 200003")).toBeInTheDocument();
  });

  it("avisa, junto ao título do bloco, quando o Imposto Seletivo está recolhido mas tem valores digitados (só nesse caso)", async () => {
    stub();
    await abrir();
    const item = screen.getByRole("group", { name: "Item 1" });
    const aviso = /valores digitados neste bloco não serão enviados enquanto ele estiver recolhido/;
    expect(within(item).queryByText(aviso)).not.toBeInTheDocument(); // recolhido e vazio
    const detalhes = item.querySelector("details")!;
    alternarDetalhes(detalhes, true);
    fireEvent.change(within(item).getByLabelText("Imposto informado"), { target: { value: "15" } });
    expect(within(item).queryByText(aviso)).not.toBeInTheDocument(); // aberto
    alternarDetalhes(detalhes, false);
    expect(within(item).getByText(aviso)).toBeInTheDocument(); // recolhido com valor
    expect(detalhes.querySelector("summary")!.textContent).toMatch(aviso);
  });
});
