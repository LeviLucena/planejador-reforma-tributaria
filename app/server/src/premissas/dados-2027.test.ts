import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { abrirBanco } from "../db/banco.js";
import { carregarArquivo } from "./carregador.js";

const ARQUIVO = fileURLToPath(new URL("../../../../dados/premissas/2027-oficial.json", import.meta.url));

interface LinhaGravada {
  tributo: string;
  aliquota: string;
  origem: string;
  fonte_norma: string | null;
  fonte_artigo: string | null;
  consultado_em: string | null;
}

describe("dados/premissas/2027-oficial.json", () => {
  it("carrega pelo carregador, com fonte completa em toda linha e nenhuma linha de usuário", () => {
    const banco = abrirBanco(":memory:");
    try {
      const r = carregarArquivo(banco, ARQUIVO);
      // Zero linhas também seria aceitável (tudo lacuna); hoje há linhas do IBS 2027-2028.
      expect(r.linhas).toBeGreaterThanOrEqual(0);
      const linhas = banco
        .prepare("SELECT * FROM premissa_aliquota WHERE conjunto_id = ?")
        .all(r.conjuntoId) as LinhaGravada[];
      expect(linhas).toHaveLength(r.linhas);
      for (const l of linhas) {
        expect(l.origem).not.toBe("usuario");
        expect(l.fonte_norma?.trim()).toBeTruthy();
        expect(l.fonte_artigo?.trim()).toBeTruthy();
        expect(l.consultado_em).toBe("2026-11-18");
      }
      const conjunto = banco
        .prepare("SELECT vigencia_inicio, validado_por, validado_em FROM conjunto_premissas WHERE id = ?")
        .get(r.conjuntoId);
      expect(conjunto).toEqual({ vigencia_inicio: "2027-01-01", validado_por: null, validado_em: null });
    } finally {
      banco.close();
    }
  });
});
