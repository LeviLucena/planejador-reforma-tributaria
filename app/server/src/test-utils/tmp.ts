import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Banco } from "../db/banco.js";

// Pasta temporária com bancos rastreados: limpar() fecha TODAS as conexões
// primeiro e só depois remove a pasta (no Windows, arquivo aberto/-wal impede o rmdir).
export function criarTemporario(prefixo: string) {
  const dir = mkdtempSync(join(tmpdir(), prefixo));
  const abertos: Banco[] = [];
  return {
    dir,
    rastrear(banco: Banco): Banco {
      abertos.push(banco);
      return banco;
    },
    limpar(): void {
      for (const b of abertos.splice(0)) if (b.open) b.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
}
