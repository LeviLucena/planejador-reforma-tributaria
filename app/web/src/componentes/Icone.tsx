import type { LucideIcon } from "lucide-react";

/** Ícone decorativo (lucide-react, empacotado no build): sempre escondido dos leitores de tela. */
export function Icone({ de: Componente, className }: { de: LucideIcon; className?: string }) {
  return <Componente aria-hidden="true" focusable="false" className={className ? `icone ${className}` : "icone"} strokeWidth={2} />;
}

/** Bússola da marca: desenho próprio em SVG, sem arquivo externo. */
export function MarcaBussola() {
  return (
    <svg className="marca-simbolo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <path d="M16 4.5v2.5M16 25v2.5M4.5 16h2.5M25 16h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <path d="M10.5 21.5 14.4 14.4 17.6 17.6Z" fill="currentColor" opacity="0.75" />
      <path d="M21.5 10.5 14.4 14.4 17.6 17.6Z" fill="var(--cor-destaque)" />
      <circle cx="16" cy="16" r="1.4" fill="var(--cor-tinta)" />
    </svg>
  );
}
