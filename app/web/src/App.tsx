import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AvisoSimulacao } from "./componentes/AvisoSimulacao";
import { PaginaEmpresaDetalhe } from "./paginas/EmpresaDetalhe";
import { PaginaEmpresas } from "./paginas/Empresas";
import { PaginaPremissas } from "./paginas/Premissas";
import { PaginaSimuladorComCenarios } from "./paginas/SimuladorComCenarios";

// Para adicionar uma página: uma linha aqui e uma em ROTAS.
const NAVEGACAO = [
  { caminho: "/", rotulo: "Simulador" },
  { caminho: "/empresas", rotulo: "Empresas" },
  { caminho: "/premissas", rotulo: "Premissas" },
];

export function Layout() {
  return (
    <div className="layout">
      <header className="topo">
        <span className="marca">Planejador da Reforma Tributária</span>
        <nav aria-label="Principal">
          {NAVEGACAO.map((n) => (
            <NavLink key={n.caminho} to={n.caminho} end={n.caminho === "/"}>
              {n.rotulo}
            </NavLink>
          ))}
        </nav>
      </header>
      <AvisoSimulacao />
      <main className="conteudo">
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
