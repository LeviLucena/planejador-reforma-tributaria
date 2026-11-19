import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PaginaPremissas } from "./Premissas";
import oficial from "../../../../dados/premissas/2027-oficial.json"; // dados reais levantados com fonte

type Chamada = { url: string; metodo: string; corpo?: unknown };

// Linhas reais do arquivo oficial, no formato devolvido pela API.
const linhasOficiais = oficial.linhas.map((l, i) => ({
  id: i + 1,
  tributo: l.tributo,
  uf: null,
  municipioIbge: null,
  aliquota: l.aliquota,
  origem: l.origem,
  fonteNorma: l.fonteNorma,
  fonteArtigo: l.fonteArtigo,
  consultadoEm: l.consultadoEm,
}));

const conjuntoOficial = {
  id: 1,
  nome: oficial.conjunto.nome,
  vigenciaInicio: oficial.conjunto.vigenciaInicio,
  vigenciaFim: oficial.conjunto.vigenciaFim,
  observacao: null,
  validadoPor: null,
  validadoEm: null,
  linhas: 2,
};
// Conjunto sintético de teste: premissas do próprio usuário, sem valor oficial.
const conjuntoUsuario = {
  id: 2,
  nome: "Cenário do usuário (teste)",
  vigenciaInicio: "2027-01-01",
  vigenciaFim: null,
  observacao: null,
  validadoPor: "Ana",
  validadoEm: "2026-11-18T12:00:00.000Z",
  linhas: 0,
};

function resp(status: number, corpo: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo) };
}

function stub(extra: (c: Chamada) => ReturnType<typeof resp> | undefined = () => undefined) {
  const chamadas: Chamada[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const c: Chamada = { url, metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(init.body as string) : undefined };
      chamadas.push(c);
      const r = extra(c);
      if (r) return r;
      if (url === "/api/premissas/conjuntos") return resp(200, [conjuntoOficial, conjuntoUsuario]);
      if (url === "/api/premissas/conjuntos/1/linhas") return resp(200, linhasOficiais);
      if (url === "/api/premissas/conjuntos/2/linhas") return resp(200, []);
      return resp(404, { codigo: "NAO_ENCONTRADO", mensagem: "x" });
    }),
  );
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

async function abrirConjunto1() {
  render(<PaginaPremissas />);
  fireEvent.click(await screen.findByRole("button", { name: /Oficial 2027/ }));
  return screen.findByRole("region", { name: /Linhas de/ });
}

describe("lista de conjuntos", () => {
  it("mostra nome, vigência, número de linhas e o status de validação", async () => {
    stub();
    render(<PaginaPremissas />);
    const linha1 = (await screen.findByRole("button", { name: /Oficial 2027/ })).closest("tr")!;
    expect(within(linha1).getByText("01/01/2027 a 31/12/2028")).toBeInTheDocument();
    expect(within(linha1).getByText("2")).toBeInTheDocument();
    expect(within(linha1).getByText("pendente de validação")).toBeInTheDocument();
    const linha2 = screen.getByRole("button", { name: /Cenário do usuário/ }).closest("tr")!;
    expect(within(linha2).getByText("validado por Ana em 18/11/2026")).toBeInTheDocument();
    expect(within(linha2).getByText("01/01/2027 em diante")).toBeInTheDocument();
  });

  it("explica a diferença entre linha oficial e premissa sua", async () => {
    stub();
    render(<PaginaPremissas />);
    expect(await screen.findByText(/trazem a sua fonte legal/)).toBeInTheDocument();
    expect(screen.getByText(/suposição sua e não tem valor oficial/)).toBeInTheDocument();
  });
});

describe("linhas do conjunto", () => {
  it("mostra tributo, alíquota formatada, selo de origem e fonte de cada linha", async () => {
    stub();
    const regiao = await abrirConjunto1();
    const linhas = within(regiao).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);
    const ibsUf = linhas.find((r) => within(r).queryByText("IBS_UF"))!;
    expect(within(ibsUf).getByText("0,05")).toBeInTheDocument();
    expect(within(ibsUf).getByText("lei de transição", { selector: ".etiqueta" })).toBeInTheDocument();
    expect(ibsUf.textContent).toContain(oficial.linhas[0]!.fonteNorma);
    expect(ibsUf.textContent).toMatch(/art\. 344, caput/);
    expect(within(ibsUf).getByText("18/11/2026")).toBeInTheDocument();
  });
});

describe("adicionar linha", () => {
  it("origem padrão é 'premissa sua' e a linha é enviada sem fonte, com a alíquota em texto", async () => {
    const chamadas = stub();
    await abrirConjunto1();
    expect(screen.getByLabelText("Origem")).toHaveValue("usuario");
    expect(screen.queryByLabelText("Norma")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Alíquota (%)"), { target: { value: "8,80" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    const post = chamadas.find((c) => c.metodo === "POST")!;
    expect(post.url).toBe("/api/premissas/conjuntos/1/linhas");
    expect(post.corpo).toEqual({ tributo: "CBS", aliquota: "8.80", origem: "usuario" });
  });

  it("oficial ou lei de transição revela e EXIGE norma, artigo e data; sem eles não chama a API", async () => {
    const chamadas = stub();
    await abrirConjunto1();
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "oficial" } });
    fireEvent.change(screen.getByLabelText("Alíquota (%)"), { target: { value: "8,8" } });
    expect(screen.getByLabelText("Norma")).toBeInTheDocument();
    expect(screen.getByLabelText("Artigo")).toBeInTheDocument();
    expect(screen.getByLabelText("Data da consulta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    expect(await screen.findByText("Linha oficial ou de lei de transição exige a norma.")).toBeInTheDocument();
    expect(screen.getByText("Linha oficial ou de lei de transição exige o artigo.")).toBeInTheDocument();
    expect(screen.getByText("Informe a data da consulta à fonte.")).toBeInTheDocument();
    expect(screen.getByLabelText("Norma")).toHaveAttribute("aria-invalid", "true");
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("com a fonte preenchida envia norma, artigo e data da consulta", async () => {
    const chamadas = stub();
    await abrirConjunto1();
    fireEvent.change(screen.getByLabelText("Origem"), { target: { value: "lei_transicao" } });
    fireEvent.change(screen.getByLabelText("Alíquota (%)"), { target: { value: "0,05" } });
    fireEvent.change(screen.getByLabelText("Norma"), { target: { value: "Lei de teste" } });
    fireEvent.change(screen.getByLabelText("Artigo"), { target: { value: "art. 1" } });
    fireEvent.change(screen.getByLabelText("Data da consulta"), { target: { value: "2026-11-18" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "POST")!.corpo).toEqual({
      tributo: "CBS",
      aliquota: "0.05",
      origem: "lei_transicao",
      fonteNorma: "Lei de teste",
      fonteArtigo: "art. 1",
      consultadoEm: "2026-11-18",
    });
  });

  it("mostra a mensagem de erro do servidor junto ao formulário", async () => {
    stub((c) =>
      c.metodo === "POST" ? resp(400, { codigo: "ENTRADA_INVALIDA", mensagem: "aliquota inválida: 100.5 é maior que 100." }) : undefined,
    );
    await abrirConjunto1();
    fireEvent.change(screen.getByLabelText("Alíquota (%)"), { target: { value: "100,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar linha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("aliquota inválida: 100.5 é maior que 100.");
  });
});

describe("criar conjunto", () => {
  it("exige nome e início e envia os dados ao servidor", async () => {
    const chamadas = stub((c) =>
      c.metodo === "POST" ? resp(201, { ...conjuntoUsuario, id: 3, nome: "Novo", validadoPor: null, validadoEm: null }) : undefined,
    );
    render(<PaginaPremissas />);
    await screen.findByRole("button", { name: /Oficial 2027/ });
    fireEvent.click(screen.getByRole("button", { name: "Criar conjunto" }));
    expect(await screen.findByText("Informe o nome do conjunto.")).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
    fireEvent.change(screen.getByLabelText("Nome do conjunto"), { target: { value: "Novo" } });
    fireEvent.change(screen.getByLabelText("Início da vigência"), { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar conjunto" }));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "POST")).toMatchObject({
      url: "/api/premissas/conjuntos",
      corpo: { nome: "Novo", vigenciaInicio: "2027-01-01" },
    });
  });
});

describe("carregar arquivo de premissas", () => {
  function escolher(conteudo: string) {
    const entrada = screen.getByLabelText("Carregar arquivo de premissas");
    const arquivo = new File([conteudo], "premissas.json", { type: "application/json" });
    fireEvent.change(entrada, { target: { files: [arquivo] } });
  }

  it("JSON inválido mostra mensagem clara em português e não chama a API de carga", async () => {
    const chamadas = stub();
    render(<PaginaPremissas />);
    await screen.findByRole("button", { name: /Oficial 2027/ });
    escolher("{ isto não é json");
    expect(await screen.findByRole("alert")).toHaveTextContent(/não é um JSON válido/);
    expect(chamadas.some((c) => c.url === "/api/premissas/carregar")).toBe(false);
  });

  it("JSON válido é enviado como está para /api/premissas/carregar e o conjunto novo é selecionado", async () => {
    const chamadas = stub((c) => (c.url === "/api/premissas/carregar" ? resp(201, { conjuntoId: 1, linhas: 2 }) : undefined));
    render(<PaginaPremissas />);
    await screen.findByRole("button", { name: /Oficial 2027/ });
    escolher(JSON.stringify(oficial));
    await screen.findByRole("region", { name: /Linhas de/ });
    const post = chamadas.find((c) => c.url === "/api/premissas/carregar")!;
    expect(post.metodo).toBe("POST");
    expect(post.corpo).toEqual(oficial);
    expect(screen.getByText(/Arquivo carregado: 2 linha\(s\)/)).toBeInTheDocument();
  });

  it("erro do servidor na carga aparece com o motivo", async () => {
    stub((c) =>
      c.url === "/api/premissas/carregar" ? resp(400, { codigo: "ENTRADA_INVALIDA", mensagem: "Arquivo de premissas, linha 0: campo tributo inválido." }) : undefined,
    );
    render(<PaginaPremissas />);
    await screen.findByRole("button", { name: /Oficial 2027/ });
    escolher(JSON.stringify({ conjunto: {}, linhas: [] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Arquivo de premissas, linha 0: campo tributo inválido.");
  });
});

describe("validar conjunto", () => {
  it("o botão fica desabilitado até digitar um nome e então envia { validadoPor } e mostra quem validou", async () => {
    let validado = false;
    const chamadas = stub((c) => {
      if (c.url === "/api/premissas/conjuntos/1/validar") {
        validado = true;
        return resp(200, { ...conjuntoOficial, validadoPor: "Maria Souza", validadoEm: "2026-11-18T15:00:00.000Z" });
      }
      if (c.url === "/api/premissas/conjuntos" && validado) {
        return resp(200, [{ ...conjuntoOficial, validadoPor: "Maria Souza", validadoEm: "2026-11-18T15:00:00.000Z" }, conjuntoUsuario]);
      }
      return undefined;
    });
    await abrirConjunto1();
    const botao = screen.getByRole("button", { name: "Validar conjunto" });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome de quem valida"), { target: { value: "   " } });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome de quem valida"), { target: { value: "Maria Souza" } });
    expect(botao).toBeEnabled();
    fireEvent.click(botao);
    expect(await screen.findByText("Conjunto validado por Maria Souza em 18/11/2026.")).toBeInTheDocument();
    const post = chamadas.find((c) => c.url === "/api/premissas/conjuntos/1/validar")!;
    expect(post.metodo).toBe("POST");
    expect(post.corpo).toEqual({ validadoPor: "Maria Souza" });
    await waitFor(() => expect(screen.queryByText("pendente de validação")).not.toBeInTheDocument());
  });
});
