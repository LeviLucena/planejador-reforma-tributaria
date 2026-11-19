import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// Fonte Inter empacotada pelo Vite (arquivos .woff2 vão para dist/assets; nada é baixado da internet).
import "@fontsource-variable/inter";
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/layout.css";
import "./estilos/componentes.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
