/**
 * Signature's own ingesta — pure parsing of pasted text into concept
 * entries, independent of AUTOGENES. One entry per line; an optional
 * "etiqueta: valor" (or "etiqueta = valor") splits the concept from its
 * value. A bare line becomes a concept whose value is itself. The studio
 * writes these into the operator's own datos store; the substrate is
 * never involved.
 */

export interface EntradaIngesta {
  etiqueta: string;
  valor: string;
}

export function parsearEntradas(texto: string): EntradaIngesta[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l): EntradaIngesta => {
      const m = l.match(/^(.*?)\s*[:=]\s*(.*)$/);
      if (m && m[1].trim()) {
        const etiqueta = m[1].trim();
        const valor = m[2].trim();
        return { etiqueta, valor: valor.length > 0 ? valor : etiqueta };
      }
      return { etiqueta: l, valor: l };
    })
    .filter((e) => e.etiqueta.length > 0);
}
