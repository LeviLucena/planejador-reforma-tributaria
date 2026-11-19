import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { abrirBanco } from "../db/banco.js";
import { carregarArquivo } from "./carregador.js";

const ARQUIVO = fileURLToPath(new URL("../../../../dados/premissas/2027-oficial.json", import.meta.url));

interface LinhaGravada {
  tributo: string;
  uf: string | null;
  municipio_ibge: string | null;
  aliquota: string;
  origem: string;
  fonte_norma: string | null;
  fonte_artigo: string | null;
  consultado_em: string | null;
}

describe("dados/premissas/2027-oficial.json", () => {
  it("carrega exatamente IBS_UF 0.05 e IBS_MUN 0.05 (art. 344), sem CBS, com fonte e vigência até 2028-12-31", () => {
    const banco = abrirBanco(":memory:");
    try {
      const r = carregarArquivo(banco, ARQUIVO);
      const linhas = banco
        .prepare("SELECT * FROM premissa_aliquota WHERE conjunto_id = ? ORDER BY tributo")
        .all(r.conjuntoId) as LinhaGravada[];
      expect(r.linhas).toBe(2);
      expect(linhas.map((l) => [l.tributo, l.uf, l.municipio_ibge, l.aliquota, l.origem])).toEqual([
        ["IBS_MUN", null, null, "0.05", "lei_transicao"],
        ["IBS_UF", null, null, "0.05", "lei_transicao"],
      ]);
      expect(linhas.some((l) => l.tributo === "CBS")).toBe(false);
      for (const l of linhas) {
        expect(l.fonte_norma).toBe("Lei Complementar nº 214, de 16 de janeiro de 2025");
        expect(l.fonte_artigo).toMatch(/^art\. 344, caput/);
        expect(l.consultado_em).toBe("2026-11-18");
      }
      const conjunto = banco
        .prepare(
          "SELECT vigencia_inicio, vigencia_fim, validado_por, validado_em FROM conjunto_premissas WHERE id = ?",
        )
        .get(r.conjuntoId);
      expect(conjunto).toEqual({
        vigencia_inicio: "2027-01-01",
        vigencia_fim: "2028-12-31",
        validado_por: null,
        validado_em: null,
      });
    } finally {
      banco.close();
    }
  });
});
