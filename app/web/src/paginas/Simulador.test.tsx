import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PaginaSimulador } from "./Simulador";
import classificacoes from "../test/classificacoes-amostra.json"; // amostra real do motor, truncada
import fundamentacoes from "../test/fundamentacoes-amostra.json"; // amostra real do motor, truncada
import respostaOficial from "../test/resposta-oficial.json"; // resposta real do motor (fixture oficial)

const conjuntos = [
  { id: 1, nome: "Premissas 2027 (rascunho)", vigenciaInicio: "2027-01-01", vigenciaFim: null, observacao: null, validadoPor: null, validadoEm: null, linhas: 4 },
  { id: 2, nome: "Premissas validadas", vigenciaInicio: "2027-01-01", vigenciaFim: "2027-12-31", observacao: null, validadoPor: "Ana", validadoEm: "2026-11-18", linhas: 4 },
];

function resp(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo) };
}

type Simular = { status: number; corpo: unknown } | "rede" | "pendente";

function stub(opcoes: { conjuntos?: unknown[]; simular?: Simular } = {}) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  const simular = opcoes.simular ?? { status: 200, corpo: { resultado: respostaOficial, entradaEnviada: {}, origensPremissas: {} } };
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    if (url.startsWith("/api/premissas/conjuntos")) return resp(200, opcoes.conjuntos ?? conjuntos);
    if (url.startsWith("/api/classificacoes")) return resp(200, classificacoes);
    if (url.startsWith("/api/fundamentacoes")) return resp(200, fundamentacoes);
    if (url === "/api/simular") {
      if (simular === "rede") throw new TypeError("fail");
      if (simular === "pendente") return new Promise(() => {});
      return resp(simular.status, simular.corpo);
    }
    return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "x" });
  });
  vi.stubGlobal("fetch", fetchFalso);
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

async function abrir(aoSimular?: (...a: never[]) => void) {
  render(<PaginaSimulador aoSimular={aoSimular as never} />);
  await screen.findByRole("option", { name: /Premissas 2027/ });
}

async function carregarExemplo() {
  fireEvent.click(screen.getByRole("button", { name: "Carregar exemplo oficial da Receita" }));
  await screen.findByRole("group", { name: "Item 4" });
}

async function simular() {
  fireEvent.click(screen.getByRole("button", { name: "Simular" }));
}

describe("formulário", () => {
  it("tem UF (27), município, data/hora, conjunto e um item inicial com NCM/NBS, CST, cClassTrib, base, quantidade e unidade", async () => {
    stub();
    await abrir();
    expect(within(screen.getByLabelText("UF")).getAllByRole("option")).toHaveLength(28); // 27 + "Selecione"
    expect(screen.getByLabelText(/Município/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Data e hora do fato gerador/)).toHaveAttribute("type", "datetime-local");
    expect(screen.getByLabelText("Conjunto de premissas")).toBeInTheDocument();
    const item = screen.getByRole("group", { name: "Item 1" });
    for (const r of ["Tipo de código", "CST", "cClassTrib", "Base de cálculo", "Quantidade", "Unidade"]) {
      expect(within(item).getByLabelText(r)).toBeInTheDocument();
    }
    expect(within(item).getByRole("option", { name: "NCM (8 dígitos)" })).toBeInTheDocument();
    expect(within(item).getByRole("option", { name: "NBS (9 dígitos)" })).toBeInTheDocument();
  });

  it("CST e cClassTrib vêm da API e o cClassTrib é filtrado pelo CST escolhido", async () => {
    const chamadas = stub();
    await abrir();
    const item = screen.getByRole("group", { name: "Item 1" });
    await within(item).findByRole("option", { name: /^200 —/ });
    expect(chamadas.some((c) => c.url === "/api/classificacoes?data=2027-01-01")).toBe(true);
    fireEvent.change(within(item).getByLabelText("CST"), { target: { value: "200" } });
    const classes = within(within(item).getByLabelText("cClassTrib")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(classes).toContain("200003");
    expect(classes).not.toContain("000001");
  });

  it("lista os conjuntos com vigência e marca os não validados como 'pendente de validação'", async () => {
    stub();
    await abrir();
    expect(screen.getByRole("option", { name: /Premissas 2027 \(rascunho\).*2027-01-01.*pendente de validação/ })).toBeInTheDocument();
    const validado = screen.getByRole("option", { name: /Premissas validadas/ });
    expect(validado.textContent).toMatch(/2027-01-01 a 2027-12-31/);
    expect(validado.textContent).not.toMatch(/pendente/);
    expect(screen.getByText("pendente de validação", { selector: ".etiqueta" })).toBeInTheDocument();
  });

  it("sem conjuntos: mensagem clara e botão Simular desabilitado", async () => {
    stub({ conjuntos: [] });
    render(<PaginaSimulador />);
    expect(await screen.findByText(/Nenhum conjunto de premissas cadastrado/)).toBeInTheDocument();
    expect(screen.getByText(/página de premissas chega em uma etapa seguinte/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular" })).toBeDisabled();
  });

  it("'Carregar exemplo oficial da Receita' preenche 4 itens com o Imposto Seletivo do item 2", async () => {
    stub();
    await abrir();
    expect(screen.getByText(/exemplo oficial da documentação da Receita/i)).toBeInTheDocument();
    await carregarExemplo();
    expect(screen.getByLabelText("UF")).toHaveValue("RS");
    expect(screen.getByLabelText(/Município/)).toHaveValue("4314902");
    expect(screen.getByLabelText(/Data e hora do fato gerador/)).toHaveValue("2027-03-10T10:00");
    expect(screen.getAllByRole("group", { name: /^Item \d$/ })).toHaveLength(4);
    const i2 = screen.getByRole("group", { name: "Item 2" });
    expect(within(i2).getByLabelText("Imposto informado")).toHaveValue("15");
    expect(within(i2).getByLabelText("Alíquota ad valorem (%)")).toHaveValue("10");
    const i3 = screen.getByRole("group", { name: "Item 3" });
    expect(within(i3).getByLabelText("Tipo de código")).toHaveValue("nbs");
    expect(within(i3).getByLabelText("Código NBS")).toHaveValue("122011200");
    expect(within(i3).getByLabelText("Base de cálculo")).toHaveValue("1200");
  });
});

describe("validação no cliente", () => {
  it("mostra mensagens em português ligadas aos campos e não chama a API", async () => {
    const chamadas = stub();
    await abrir();
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "123" } });
    const item = screen.getByRole("group", { name: "Item 1" });
    fireEvent.change(within(item).getByLabelText("Código NCM"), { target: { value: "12" } });
    fireEvent.change(within(item).getByLabelText("CST"), { target: { value: "20" } });
    await simular();
    const mun = screen.getByLabelText(/Município/);
    expect(mun).toHaveAttribute("aria-invalid", "true");
    const msg = document.getElementById(mun.getAttribute("aria-describedby")!.split(" ").pop()!)!;
    expect(msg).toHaveTextContent("O município deve ter exatamente 7 dígitos");
    expect(screen.getByLabelText("UF")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/O código NCM deve ter exatamente 8 dígitos/)).toBeInTheDocument();
    expect(screen.getByText("O CST deve ter exatamente 3 dígitos.")).toBeInTheDocument();
    expect(screen.getByText("O cClassTrib deve ter exatamente 6 dígitos.")).toBeInTheDocument();
    expect(chamadas.some((c) => c.url === "/api/simular")).toBe(false);
  });

  it("NBS exige 9 dígitos e a lista não pode ficar vazia", async () => {
    stub();
    await abrir();
    const item = screen.getByRole("group", { name: "Item 1" });
    fireEvent.change(within(item).getByLabelText("Tipo de código"), { target: { value: "nbs" } });
    fireEvent.change(within(item).getByLabelText("Código NBS"), { target: { value: "12345678" } });
    await simular();
    expect(screen.getByText(/O código NBS deve ter exatamente 9 dígitos/)).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Remover item 1" }));
    await simular();
    expect(screen.getByText("Inclua pelo menos um item na operação.")).toBeInTheDocument();
  });
});

describe("simulação com a resposta oficial do motor", () => {
  it("mostra os itens 1 a 3 calculados e o erro REG-011 do item 4 ao mesmo tempo", async () => {
    stub();
    await abrir();
    await carregarExemplo();
    await simular();
    const resultado = await screen.findByRole("region", { name: "Resultado da simulação" });
    for (const n of [1, 2, 3]) {
      const it = within(resultado).getByRole("article", { name: `Item ${n}` });
      expect(within(it).getByText("CALCULO_SIMULADO")).toBeInTheDocument();
    }
    const i2 = within(resultado).getByRole("article", { name: "Item 2" });
    expect(within(i2).getByText("165,00")).toBeInTheDocument(); // base IBS/CBS
    expect(within(i2).getByText("14,52")).toBeInTheDocument(); // CBS
    expect(within(i2).getByText("15,00")).toBeInTheDocument(); // IS
    const i4 = within(resultado).getByRole("article", { name: "Item 4" });
    expect(within(i4).getByText("INCONSISTENCIA_ENTRADA")).toBeInTheDocument();
    expect(within(i4).getByText("REG-011")).toBeInTheDocument();
    expect(within(i4).getByText("NCM não vinculada")).toBeInTheDocument();
    expect(within(i4).getByText(/NCM de código 02013000 não vinculada/)).toBeInTheDocument();
  });

  it("mostra os totais formatados: CBS 56,76, IBS 0,64, IS 15,00 e base 1.465,00", async () => {
    stub();
    await abrir();
    await carregarExemplo();
    await simular();
    const totais = await screen.findByRole("region", { name: "Totais" });
    expect(within(totais).getByText("56,76")).toBeInTheDocument();
    expect(within(totais).getByText("0,64")).toBeInTheDocument();
    expect(within(totais).getByText("15,00")).toBeInTheDocument();
    expect(within(totais).getByText("1.465,00")).toBeInTheDocument();
  });

  it("cada item expande para a memória de cálculo e a fundamentação legal do cClassTrib", async () => {
    stub();
    await abrir();
    await carregarExemplo();
    await simular();
    const i3 = await screen.findByRole("article", { name: "Item 3" });
    expect(within(i3).queryByText("Fundamentação legal")).not.toBeInTheDocument();
    fireEvent.click(within(i3).getByRole("button", { name: /Memória de cálculo e fundamentação legal/ }));
    expect(within(i3).getByText("Memória de cálculo")).toBeInTheDocument();
    expect(within(i3).getAllByText(/Operação de consumo com enquadramento legal em Art\. 129/).length).toBeGreaterThanOrEqual(3);
    expect(within(i3).getByText("Fundamentação legal")).toBeInTheDocument();
    expect(within(i3).getByText("Art. 129")).toBeInTheDocument(); // textoCurto
    expect(within(i3).getByText(/Ficam reduzidas em 60%/)).toBeInTheDocument(); // texto
    expect(within(i3).getByText(/Dos Serviços de Educação/)).toBeInTheDocument(); // referenciaNormativa
  });

  it("mostra as origens das premissas com rótulos distintos", async () => {
    stub({
      simular: {
        status: 200,
        corpo: {
          resultado: respostaOficial,
          entradaEnviada: {},
          origensPremissas: { CBS: "oficial", IBS_UF: "lei_transicao", IBS_MUN: "usuario" },
        },
      },
    });
    await abrir();
    await carregarExemplo();
    await simular();
    const origens = await screen.findByRole("region", { name: "Origem das premissas" });
    expect(within(origens).getByText("oficial")).toBeInTheDocument();
    expect(within(origens).getByText("lei de transição")).toBeInTheDocument();
    expect(within(origens).getByText("premissa sua")).toBeInTheDocument();
  });

  it("envia strings nos campos monetários e a data ISO com o deslocamento do navegador", async () => {
    const chamadas = stub();
    await abrir();
    await carregarExemplo();
    await simular();
    await screen.findByRole("region", { name: "Totais" });
    const envio = chamadas.find((c) => c.url === "/api/simular")!;
    const corpo = JSON.parse(envio.init!.body as string);
    expect(corpo.conjuntoPremissasId).toBe(1);
    expect(corpo.operacao.dhFatoGerador).toMatch(/^2027-03-10T10:00:00[+-]\d{2}:\d{2}$/);
    expect(corpo.operacao.municipio).toBe(4314902);
    const [i1, i2, i3] = corpo.operacao.itens;
    expect(i1.baseCalculo).toBe("100");
    expect(i1.quantidade).toBe("20");
    expect(i1.aliquotasNominais).toEqual({ cbs: "8.8", ibsEstadual: "0.05", ibsMunicipal: "0.05" });
    expect(i2.impostoSeletivo.baseCalculo).toBe("150");
    expect(i2.impostoSeletivo.impostoInformado).toBe("15");
    expect(i2.aliquotasNominais.impostoSeletivo).toEqual({ adValorem: "10" });
    expect(i3.nbs).toBe("122011200");
    expect(i3.ncm).toBeUndefined();
    expect(i3.baseCalculo).toBe("1200");
  });

  it("alíquotas em branco não vão na requisição (usar as premissas)", async () => {
    const chamadas = stub();
    await abrir();
    fireEvent.change(screen.getByLabelText("UF"), { target: { value: "RS" } });
    fireEvent.change(screen.getByLabelText(/Município/), { target: { value: "4314902" } });
    const item = screen.getByRole("group", { name: "Item 1" });
    fireEvent.change(within(item).getByLabelText("Código NCM"), { target: { value: "10063021" } });
    fireEvent.change(within(item).getByLabelText("CST"), { target: { value: "200" } });
    fireEvent.change(within(item).getByLabelText("cClassTrib"), { target: { value: "200003" } });
    fireEvent.change(within(item).getByLabelText("Base de cálculo"), { target: { value: "100,50" } });
    await simular();
    await screen.findByRole("region", { name: "Totais" });
    const corpo = JSON.parse(chamadas.find((c) => c.url === "/api/simular")!.init!.body as string);
    expect(corpo.operacao.itens[0].aliquotasNominais).toBeUndefined();
    expect(corpo.operacao.itens[0].baseCalculo).toBe("100.50");
  });

  it("expõe a última simulação bem-sucedida em aoSimular", async () => {
    stub();
    const aoSimular = vi.fn();
    await abrir(aoSimular);
    await carregarExemplo();
    await simular();
    await screen.findByRole("region", { name: "Totais" });
    expect(aoSimular).toHaveBeenCalledTimes(1);
    const [req, resposta] = aoSimular.mock.calls[0]!;
    expect(req.operacao.itens).toHaveLength(4);
    expect(resposta.resultado.objetos).toHaveLength(4);
  });

  it("enquanto simula, desabilita o botão e mostra o andamento", async () => {
    stub({ simular: "pendente" });
    await abrir();
    await carregarExemplo();
    await simular();
    const botao = await screen.findByRole("button", { name: "Simulando…" });
    expect(botao).toBeDisabled();
  });
});

describe("estados de erro", () => {
  async function simularComErro(status: number, corpo: unknown) {
    stub({ simular: { status, corpo } });
    await abrir();
    await carregarExemplo();
    await simular();
    return screen.findByRole("alert");
  }

  it("PREMISSA_AUSENTE mostra a mensagem com o tributo e nenhum total", async () => {
    const alerta = await simularComErro(422, { codigo: "PREMISSA_AUSENTE", mensagem: "Falta a premissa de IBS_UF para RS." });
    expect(alerta).toHaveTextContent("Falta a premissa de IBS_UF para RS.");
    expect(screen.queryByRole("region", { name: "Totais" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Resultado da simulação" })).not.toBeInTheDocument();
  });

  it("MOTOR_INDISPONIVEL explica como iniciar os motores", async () => {
    const alerta = await simularComErro(503, { codigo: "MOTOR_INDISPONIVEL", mensagem: "Motor fora." });
    expect(alerta).toHaveTextContent(/motores de cálculo não estão em execução/i);
    expect(alerta).toHaveTextContent("scripts/iniciar-motores.ps1");
    expect(screen.queryByRole("region", { name: "Totais" })).not.toBeInTheDocument();
  });

  it("ENTRADA_INVALIDA mostra a mensagem", async () => {
    const alerta = await simularComErro(400, { codigo: "ENTRADA_INVALIDA", mensagem: "Campo uf inválido: esperada sigla." });
    expect(alerta).toHaveTextContent("Campo uf inválido: esperada sigla.");
  });

  it("SEM_CONEXAO diz que o servidor do app não responde", async () => {
    stub({ simular: "rede" });
    await abrir();
    await carregarExemplo();
    await simular();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/servidor do app não responde/);
  });

  it("um erro limpa o resultado anterior (sem totais velhos)", async () => {
    stub();
    await abrir();
    await carregarExemplo();
    await simular();
    await screen.findByRole("region", { name: "Totais" });
    stub({ simular: { status: 422, corpo: { codigo: "PREMISSA_AUSENTE", mensagem: "Falta CBS." } } });
    await simular();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Falta CBS."));
    expect(screen.queryByRole("region", { name: "Totais" })).not.toBeInTheDocument();
  });
});
