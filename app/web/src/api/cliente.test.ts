import { cliente, ErroApi } from "./cliente";

function resposta(status: number, corpo?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (corpo === undefined ? "" : JSON.stringify(corpo)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("cliente", () => {
  it("simular envia POST /api/simular com JSON e devolve o corpo", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetchFalso);
    const req = { operacao: {}, conjuntoPremissasId: 1 } as never;
    expect(await cliente.simular(req)).toEqual({ ok: 1 });
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("/api/simular");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ operacao: {}, conjuntoPremissasId: 1 });
  });

  it("corpo de erro vira ErroApi com codigo e status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(503, { codigo: "MOTOR_INDISPONIVEL", mensagem: "Motor fora." })));
    const erro = await cliente.saude().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
    expect(erro.status).toBe(503);
    expect(erro.message).toBe("Motor fora.");
  });

  it("falha de rede vira SEM_CONEXAO", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fail")));
    const erro = await cliente.saude().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.codigo).toBe("SEM_CONEXAO");
    expect(erro.status).toBe(0);
  });

  it("204 devolve undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(204)));
    expect(await cliente.empresas.remover(3)).toBeUndefined();
  });

  it("2xx com corpo que não é JSON vira RESPOSTA_INVALIDA; corpo vazio devolve undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>oops" }));
    const erro = await cliente.saude().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro.codigo).toBe("RESPOSTA_INVALIDA");
    expect(erro.status).toBe(200);
    expect(erro.message).toMatch(/servidor/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(200)));
    expect(await cliente.saude()).toBeUndefined();
  });

  const op = { id: "x" } as never;
  const casos: [string, () => Promise<unknown>, string, string][] = [
    ["saude", () => cliente.saude(), "GET", "/api/saude"],
    ["classificacoes", () => cliente.classificacoes("2027-01-01"), "GET", "/api/classificacoes?data=2027-01-01"],
    ["fundamentacoes", () => cliente.fundamentacoes("2027-01-01"), "GET", "/api/fundamentacoes?data=2027-01-01"],
    ["premissas.conjuntos", () => cliente.premissas.conjuntos(), "GET", "/api/premissas/conjuntos"],
    ["empresas.listar", () => cliente.empresas.listar(), "GET", "/api/empresas"],
    ["empresas.obter", () => cliente.empresas.obter(2), "GET", "/api/empresas/2"],
    ["empresas.criar", () => cliente.empresas.criar({} as never), "POST", "/api/empresas"],
    ["empresas.atualizar", () => cliente.empresas.atualizar(2, {} as never), "PUT", "/api/empresas/2"],
    ["empresas.remover", () => cliente.empresas.remover(2), "DELETE", "/api/empresas/2"],
    ["cenarios.listar", () => cliente.cenarios.listar(2), "GET", "/api/empresas/2/cenarios"],
    ["cenarios.salvar", () => cliente.cenarios.salvar(2, { nome: "n", operacao: op, conjuntoPremissasId: 1 }), "POST", "/api/empresas/2/cenarios"],
    ["cenarios.obter", () => cliente.cenarios.obter(5), "GET", "/api/cenarios/5"],
    ["cenarios.recalcular", () => cliente.cenarios.recalcular(5), "POST", "/api/cenarios/5/recalcular"],
  ];
  it.each(casos)("%s chama o método e caminho certos", async (_n, chamar, metodo, caminho) => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(200, {}));
    vi.stubGlobal("fetch", fetchFalso);
    await chamar();
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe(caminho);
    expect(init.method).toBe(metodo);
  });
});

describe("cliente.premissas", () => {
  it.each([
    ["criarConjunto", () => cliente.premissas.criarConjunto({ nome: "a", vigenciaInicio: "2027-01-01" }), "POST", "/api/premissas/conjuntos", { nome: "a", vigenciaInicio: "2027-01-01" }],
    ["linhas", () => cliente.premissas.linhas(3), "GET", "/api/premissas/conjuntos/3/linhas", undefined],
    ["adicionarLinha", () => cliente.premissas.adicionarLinha(3, { tributo: "CBS", aliquota: "1", origem: "usuario" }), "POST", "/api/premissas/conjuntos/3/linhas", { tributo: "CBS", aliquota: "1", origem: "usuario" }],
    ["duplicar", () => cliente.premissas.duplicar(3), "POST", "/api/premissas/conjuntos/3/duplicar", undefined],
    ["carregar", () => cliente.premissas.carregar({ conjunto: {}, linhas: [] }), "POST", "/api/premissas/carregar", { conjunto: {}, linhas: [] }],
    ["validar", () => cliente.premissas.validar(3, "Ana"), "POST", "/api/premissas/conjuntos/3/validar", { validadoPor: "Ana" }],
  ])("%s usa o método, o caminho e o corpo certos", async (_n, chamar, metodo, caminho, corpo) => {
    const fetchFalso = vi.fn().mockResolvedValue(resposta(200, {}));
    vi.stubGlobal("fetch", fetchFalso);
    await chamar();
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe(caminho);
    expect(init.method).toBe(metodo);
    expect(init.body === undefined ? undefined : JSON.parse(init.body)).toEqual(corpo);
  });
});
