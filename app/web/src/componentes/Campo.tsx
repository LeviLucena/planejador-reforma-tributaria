import type { ReactNode } from "react";

interface Props {
  id: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  /** Recebe os atributos de acessibilidade que ligam o controle à dica e ao erro. */
  children: (acess: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}

/** Rótulo + controle + dica + mensagem de erro, ligados por aria-describedby e aria-invalid. */
export function Campo({ id, rotulo, erro, dica, children }: Props) {
  const ids = [dica ? `${id}-dica` : null, erro ? `${id}-erro` : null].filter(Boolean).join(" ");
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
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
          {erro}
        </small>
      )}
    </div>
  );
}
