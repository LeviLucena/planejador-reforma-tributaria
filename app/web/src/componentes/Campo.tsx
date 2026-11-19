import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Icone } from "./Icone";

interface Props {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  /** Classe extra no contêiner (ex.: "largo" ocupa 2 colunas da grade em telas largas). */
  className?: string;
  /** Recebe os atributos de acessibilidade que ligam o controle à dica e ao erro. */
  children: (acess: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}

/** "Fim da vigência (opcional)": o sufixo "(opcional)" sai em tom mais suave; o texto do rótulo não muda. */
function Rotulo({ texto }: { texto: string }) {
  const m = /^(.*?)(\s*)(\((?:[^()]*,\s*)?opcional\))$/.exec(texto);
  if (!m) return <>{texto}</>;
  return (
    <>
      {m[1]}
      {m[2]}
      <span className="opcional">{m[3]}</span>
    </>
  );
}

/** Rótulo + controle + dica + mensagem de erro, ligados por aria-describedby e aria-invalid. */
export function Campo({ id, rotulo, erro, dica, className, children }: Props) {
  const ids = [dica ? `${id}-dica` : null, erro ? `${id}-erro` : null].filter(Boolean).join(" ");
  return (
    <div className={className ? `campo ${className}` : "campo"}>
      <label htmlFor={id}>
        <Rotulo texto={rotulo} />
      </label>
      {children({
        id,
        ...(erro ? { "aria-invalid": true as const } : {}),
        ...(ids ? { "aria-describedby": ids } : {}),
      })}
      {dica && (
        <small id={`${id}-dica`} className="dica">
          {dica}
        </small>
      )}
      {erro && (
        <small id={`${id}-erro`} className="erro-campo">
          <Icone de={CircleAlert} />
          <span>{erro}</span>
        </small>
      )}
    </div>
  );
}
