// Funções puras usadas por index.ts (separadas para teste).

/** Mensagem de uma linha quando o servidor não consegue escutar na porta. */
export function mensagemFalhaListen(erro: unknown, porta: number): string {
  const codigo = (erro as { code?: string } | null)?.code;
  if (codigo === "EADDRINUSE") {
    return `a porta ${porta} já está em uso por outro programa. Feche-o (ou rode scripts/parar.bat) ou escolha outra porta em PORTA_APP.`;
  }
  if (codigo === "EACCES") {
    return `sem permissão para usar a porta ${porta}. Escolha outra porta em PORTA_APP.`;
  }
  const msg = erro instanceof Error ? erro.message : String(erro);
  return `não foi possível iniciar o servidor na porta ${porta}: ${msg}`;
}

/** Origens extras aceitas pela proteção local: só a do servidor do Vite e só com MODO_DEV=1. */
export function origensExtrasDev(modoDev: string | undefined): string[] {
  return modoDev === "1" ? ["http://127.0.0.1:5173", "http://localhost:5173"] : [];
}
