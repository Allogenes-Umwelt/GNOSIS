import { banxico } from "@/conectores/banxico";
import { frankfurter } from "@/conectores/frankfurter";
import { nagerDate } from "@/conectores/nager-date";
import { openFoodFacts } from "@/conectores/open-food-facts";
import { openMeteo } from "@/conectores/open-meteo";
import { osm } from "@/conectores/osm";
import { profecoQqp } from "@/conectores/profeco-qqp";
import { overpass } from "@/conectores/overpass";
import { restCountries } from "@/conectores/rest-countries";
import { sat69b } from "@/conectores/sat-69b";
import { wikidata } from "@/conectores/wikidata";
import { wikipedia } from "@/conectores/wikipedia";
import type { Conector } from "@/types/conector";

/**
 * Connector registry — the allowlist. The /api/conector route refuses
 * anything not registered here, and the consultar_servicio tool derives
 * its catalog from it. Adding a connector = one module + one line.
 */

export const conectores: Conector[] = [
  banxico,
  frankfurter,
  openMeteo,
  nagerDate,
  osm,
  overpass,
  profecoQqp,
  sat69b,
  wikidata,
  wikipedia,
  restCountries,
  openFoodFacts,
];

export function getConector(id: string): Conector | undefined {
  return conectores.find((c) => c.manifest.id === id);
}

/** Compact catalog for the consultar_servicio tool description. */
export function catalogoParaTools(): string {
  return conectores
    .map((c) => {
      const consultas = c.manifest.consultas
        .map((q) => {
          const params = q.parametros
            .map((p) => `${p.nombre}${p.requerido ? "" : "?"}`)
            .join(", ");
          return `${q.id}(${params}) — ${q.descripcion}`;
        })
        .join(" | ");
      const token =
        c.manifest.acceso === "token" ? " [requiere token del operador]" : "";
      return `- ${c.manifest.id} (${c.manifest.campo})${token}: ${consultas}`;
    })
    .join("\n");
}
