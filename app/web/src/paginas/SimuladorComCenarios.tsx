import { useState } from "react";
import type { RequisicaoSimulacao, RespostaSimulacao } from "../../../server/src/simulacao/servico";
import { SalvarCenario } from "../componentes/SalvarCenario";
import { PaginaSimulador } from "./Simulador";

/** Simulador + painel "Salvar como cenário", ligado pelo callback `aoSimular`. */
export function PaginaSimuladorComCenarios() {
  const [simulada, setSimulada] = useState<{ chave: number; requisicao: RequisicaoSimulacao; resposta: RespostaSimulacao } | null>(null);
  return (
    <>
      <PaginaSimulador
        // O painel só existe para a última simulação bem-sucedida: some ao iniciar outra (rodando ou com falha).
        aoIniciar={() => setSimulada(null)}
        aoSimular={(requisicao, resposta) => setSimulada((s) => ({ chave: (s?.chave ?? 0) + 1, requisicao, resposta }))}
      />
      {simulada && <SalvarCenario key={simulada.chave} requisicao={simulada.requisicao} exibido={simulada.resposta.resultado} />}
    </>
  );
}
