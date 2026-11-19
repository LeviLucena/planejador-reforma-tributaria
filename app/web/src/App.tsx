import { Building2, Calculator, SlidersHorizontal } from "lucide-react";
import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AvisoSimulacao } from "./componentes/AvisoSimulacao";
import { Icone, MarcaBussola } from "./componentes/Icone";
import { PaginaEmpresaDetalhe } from "./paginas/EmpresaDetalhe";
import { PaginaEmpresas } from "./paginas/Empresas";
import { PaginaPremissas } from "./paginas/Premissas";
import { PaginaSimuladorComCenarios } from "./paginas/SimuladorComCenarios";

// Para adicionar uma página: uma linha aqui e uma em ROTAS.
const NAVEGACAO = [
  { caminho: "/", rotulo: "Simulador", icone: Calculator },
  { caminho: "/empresas", rotulo: "Empresas", icone: Building2 },
  { caminho: "/premissas", rotulo: "Premissas", icone: SlidersHorizontal },
];

export function Layout() {
  return (
    <div className="layout">
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="cabecalho-fixo">
        <header className="topo">
          <div className="topo-interno">
            <span className="marca">
              <MarcaBussola />
              Planejador da Reforma Tributária
            </span>
            <nav aria-label="Principal">
              {NAVEGACAO.map((n) => (
                <NavLink key={n.caminho} to={n.caminho} end={n.caminho === "/"}>
                  <Icone de={n.icone} />
                  {n.rotulo}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <AvisoSimulacao />
      </div>
      <main className="conteudo" id="conteudo">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaginaSimuladorComCenarios />} />
        <Route path="empresas" element={<PaginaEmpresas />} />
        <Route path="empresas/:id" element={<PaginaEmpresaDetalhe />} />
        <Route path="premissas" element={<PaginaPremissas />} />
      </Route>
    </Routes>
  );
}
