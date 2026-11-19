import type { AtividadeSimples } from "../dominio/tipos.js";
import { lerJson, requisitar } from "./http.js";

export async function listarAtividades(
  urlSimples: string,
  data: string,
  timeoutMs?: number,
): Promise<AtividadeSimples[]> {
  const texto = await requisitar(
    `${urlSimples}/calculadora/simples-nacional/atividades?data=${encodeURIComponent(data)}`,
    undefined,
    { timeoutMs },
  );
  return lerJson<AtividadeSimples[]>(texto);
}
