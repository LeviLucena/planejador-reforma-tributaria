import { TriangleAlert } from "lucide-react";
import { Icone } from "./Icone";

export function AvisoSimulacao() {
  return (
    <p className="aviso-simulacao" role="note">
      <Icone de={TriangleAlert} />
      Simulação — não substitui a apuração dos tributos.
    </p>
  );
}
