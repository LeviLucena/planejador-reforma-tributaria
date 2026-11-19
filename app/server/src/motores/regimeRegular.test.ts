import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ErroDominio } from "../dominio/erros.js";
import type { OperacaoEntrada } from "../dominio/tipos.js";
import { criarMotores, extrairMemoriaCalculo, parseResultado } from "./regimeRegular.js";

const fixture = readFileSync(
  new URL("../../test/fixtures/resposta-oficial.json", import.meta.url),
  "utf8",
);

describe("parseResultado (resposta oficial real)", () => {
  const r = parseResultado(fixture);

  it("extrai os totais como strings", () => {
    const t = (r.total as any).tribCalc;
    expect(t.IBSCBSTot.gCBS.vCBS).toBe("56.76");
    expect(t.IBSCBSTot.gIBS.vIBS).toBe("0.64");
    expect(t.ISTot.vIS).toBe("15.00");
  });

  it("marca o objeto 4 como inconsistente com REG-011", () => {
    const o = r.objetos.find((x) => x.nObj === 4)!;
    expect(o.estadoItem).toBe("INCONSISTENCIA_ENTRADA");
    expect(o.erros![0]!.code).toBe("REG-011");
  });

  it("preserva a memória de cálculo em UTF-8 (item 3)", () => {
    const m = extrairMemoriaCalculo(r.objetos.find((x) => x.nObj === 3)!);
    expect(m.cbs).toContain("Art.");
    expect(m.cbs).toContain("Operação");
  });
});

describe("indisponibilidade", () => {
  it("porta fechada vira MOTOR_INDISPONIVEL", async () => {
    const m = criarMotores({
      urlRegimeRegular: "http://127.0.0.1:1/api/calculadora",
      urlSimples: "http://127.0.0.1:1/api",
    });
    const op: OperacaoEntrada = {
      id: "x", versao: "1.0.0", dhFatoGerador: "2027-01-01T00:00:00-03:00", municipio: 1, uf: "RS", itens: [],
    };
    const erro = await m.calcularOperacao(op).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
    expect(erro.status).toBe(503);
  });
});

describe("corpo enviado ao motor", () => {
  let servidor: Server;
  afterEach(() => {
    servidor?.close();
  });

  async function capturar(status = 200, resposta: string = "{}", atrasoMs = 0): Promise<{ corpo: () => string; url: string }> {
    let corpo = "";
    servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (c) => partes.push(c));
      req.on("end", () => {
        corpo = Buffer.concat(partes).toString("utf8");
        setTimeout(() => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(resposta);
        }, atrasoMs);
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const porta = (servidor.address() as AddressInfo).port;
    return { corpo: () => corpo, url: `http://127.0.0.1:${porta}` };
  }

  const op: OperacaoEntrada = {
    id: "t", versao: "1.0.0", dhFatoGerador: "2027-03-10T10:00:00-03:00", municipio: 4314902, uf: "RS",
    itens: [{
      numero: 1, ncm: "10063021", cst: "200", cClassTrib: "200003", baseCalculo: "100.00",
      aliquotasNominais: { cbs: "8.8", ibsEstadual: "0.05", ibsMunicipal: "0.05" },
    }],
  };

  it("decimais seguem como strings exatas, sem artefatos de float", async () => {
    const c = await capturar(200, '{"objetos":[],"total":{}}');
    await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op);
    expect(c.corpo()).toContain('"baseCalculo":"100.00"');
    expect(c.corpo()).toContain('"cbs":"8.8"');
    expect(c.corpo()).toContain('"ibsEstadual":"0.05"');
    expect(c.corpo()).not.toMatch(/\d\.\d{10,}/);
  });

  it("4xx do motor vira ENTRADA_INVALIDA com o detail dele", async () => {
    const c = await capturar(422, '{"detail":"O cálculo contém 1 erro(s)."}');
    const erro = await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op).catch((e) => e);
    expect(erro.codigo).toBe("ENTRADA_INVALIDA");
    expect(erro.status).toBe(400);
    expect(erro.message).toContain("O cálculo contém 1 erro(s).");
  });

  it("5xx do motor vira MOTOR_INDISPONIVEL", async () => {
    const c = await capturar(500, "{}");
    const erro = await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op).catch((e) => e);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
  });

  it("detail objeto/array não vira [object Object]", async () => {
    const c = await capturar(422, '{"detail":{"campo":"uf","motivo":"inválida"}}');
    const erro = await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op).catch((e) => e);
    expect(erro.codigo).toBe("ENTRADA_INVALIDA");
    expect(erro.message).not.toContain("[object Object]");
    expect(erro.message).toContain('"campo":"uf"');
  });

  it("2xx com corpo que não é JSON vira MOTOR_INDISPONIVEL", async () => {
    const c = await capturar(200, "<html>nao e json</html>");
    const erro = await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
    expect(erro.status).toBe(503);
  });

  it("GET sem entrada do chamador: qualquer não-2xx vira MOTOR_INDISPONIVEL", async () => {
    for (const status of [404, 422, 302]) {
      const c = await capturar(status, "{}");
      const m = criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url });
      for (const chamada of [
        () => m.versoes(),
        () => m.listarSituacoes("2027-01-01"),
        () => m.listarFundamentacoes("2027-01-01"),
        () => m.listarAtividades("2027-01-01"),
      ]) {
        const erro = await chamada().catch((e) => e);
        expect(erro.codigo, `status ${status}`).toBe("MOTOR_INDISPONIVEL");
        expect(erro.status).toBe(503);
      }
      servidor.close();
    }
  });

  it("timeout vira MOTOR_INDISPONIVEL", async () => {
    const c = await capturar(200, '{"objetos":[],"total":{}}', 500);
    const m = criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url, timeoutMs: 50 });
    const erro = await m.calcularOperacao(op).catch((e) => e);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
  });

  it("versoes() com um motor fora do ar falha por inteiro", async () => {
    const c = await capturar(200, '{"versaoApp":"1.6.1","versaoDb":"V0059"}');
    const m = criarMotores({ urlRegimeRegular: c.url, urlSimples: "http://127.0.0.1:1/api" });
    const erro = await m.versoes().catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDominio);
    expect(erro.codigo).toBe("MOTOR_INDISPONIVEL");
  });

  it("4xx com corpo que não é JSON vira ENTRADA_INVALIDA com o texto truncado", async () => {
    const c = await capturar(400, "x".repeat(500));
    const erro = await criarMotores({ urlRegimeRegular: c.url, urlSimples: c.url }).calcularOperacao(op).catch((e) => e);
    expect(erro.codigo).toBe("ENTRADA_INVALIDA");
    expect(erro.message).toBe("x".repeat(300));
  });
});
