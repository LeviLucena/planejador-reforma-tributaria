import type { AtividadeSimples } from "../dominio/tipos.js";
import { requisitar } from "./http.js";

export async function listarAtividades(urlSimples: string, data: string): Promise<AtividadeSimples[]> {
  const texto = await requisitar(
    `${urlSimples}/calculadora/simples-nacional/atividades?data=${encodeURIComponent(data)}`,
  );
  return JSON.parse(texto) as AtividadeSimples[];
}
