import type { Pipeline, ResultadoPipeline } from "@/types/pipeline";

/**
 * ICS pipeline — calendars (iCalendar/RFC 5545). Unfolds continuation
 * lines, reads each VEVENT's SUMMARY and DTSTART and docks them as
 * dated events citing a listing fragment. Deterministic; no model.
 */

const EVENTOS_POR_FRAGMENTO = 15;

function desdoblar(contenido: string): string[] {
  // RFC 5545 folding: a line starting with space/tab continues the previous.
  const crudas = contenido.split(/\r?\n/);
  const lineas: string[] = [];
  for (const l of crudas) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && lineas.length > 0) {
      lineas[lineas.length - 1] += l.slice(1);
    } else lineas.push(l);
  }
  return lineas;
}

function fechaDe(valor: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export const pipelineIcs: Pipeline = {
  id: "ics",
  nombre: "Calendario ICS",
  descripcion:
    "Lee un calendario exportado (.ics): cada cita entra como evento fechado citando su fragmento de origen.",
  detecta: (nombre, contenido) =>
    /\.ics$/i.test(nombre) ||
    contenido.slice(0, 200).includes("BEGIN:VCALENDAR"),
  procesar: (_nombre, contenido): ResultadoPipeline => {
    const lineas = desdoblar(contenido);
    const citas: { titulo: string; fecha: string }[] = [];
    let titulo: string | null = null;
    let fecha: string | null = null;
    let dentro = false;
    for (const l of lineas) {
      if (l.startsWith("BEGIN:VEVENT")) {
        dentro = true;
        titulo = null;
        fecha = null;
      } else if (l.startsWith("END:VEVENT")) {
        if (dentro && titulo && fecha) citas.push({ titulo, fecha });
        dentro = false;
      } else if (dentro) {
        if (/^SUMMARY(?:;[^:]*)?:/i.test(l)) {
          titulo = l.slice(l.indexOf(":") + 1).trim().slice(0, 160);
        } else if (/^DTSTART(?:;[^:]*)?:/i.test(l)) {
          fecha = fechaDe(l.slice(l.indexOf(":") + 1));
        }
      }
    }
    if (citas.length === 0) {
      throw new Error(
        "El calendario no contiene citas con fecha y título legibles.",
      );
    }
    citas.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const fragmentos: ResultadoPipeline["fragmentos"] = [];
    const eventos: ResultadoPipeline["eventos"] = [];
    for (let i = 0; i < citas.length; i += EVENTOS_POR_FRAGMENTO) {
      const bloque = citas.slice(i, i + EVENTOS_POR_FRAGMENTO);
      const idx = fragmentos.length;
      fragmentos.push({
        texto: bloque.map((c) => `${c.fecha} · ${c.titulo}`).join("\n"),
        pagina: idx + 1,
      });
      for (const c of bloque) {
        eventos.push({
          titulo: c.titulo,
          fecha: c.fecha,
          precision: "dia" as const,
          entidades: [],
          fragmentos: [idx],
        });
      }
    }
    return { fragmentos, entidades: [], eventos };
  },
};
