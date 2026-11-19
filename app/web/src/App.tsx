import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { AvisoSimulacao } from "./componentes/AvisoSimulacao";
import { PaginaSimulador } from "./paginas";

// Para adicionar uma página: uma linha aqui e uma em ROTAS.
const NAVEGACAO = [{ caminho: "/", rotulo: "Simulador" }];

export function Layout() {
  return (
    <div className="layout">
      <header className="topo">
        <span className="marca">Planejador da Reforma Tributária</span>
        <nav aria-label="Principal">
          {NAVEGACAO.map((n) => (
            <NavLink key={n.caminho} to={n.caminho} end>
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
        <Route index element={<PaginaSimulador />} />
      </Route>
    </Routes>
  );
}
