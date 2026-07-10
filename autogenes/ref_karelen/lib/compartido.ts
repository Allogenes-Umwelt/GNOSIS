import { createStore, entries, del, type UseStore } from "idb-keyval";

/**
 * Share inbox — the client side of the PWA share target. The service
 * worker parks whatever the OS share sheet delivers (files/text) in this
 * store; Ingesta drains it on load. Same DB/name/version as the SW.
 */
export interface CompartidoArchivo {
  clase: "archivo";
  nombre: string;
  tipo: string;
  blob: Blob;
  ts: number;
}
export interface CompartidoTexto {
  clase: "texto";
  texto: string;
  ts: number;
}
export type Compartido = CompartidoArchivo | CompartidoTexto;

let store: UseStore | null = null;
function shareStore(): UseStore {
  if (!store) store = createStore("umwelt-share", "pendientes");
  return store;
}

/** Read and CLEAR the inbox — each shared item is delivered exactly once. */
export async function drenarCompartidos(): Promise<Compartido[]> {
  try {
    const filas = await entries<IDBValidKey, Compartido>(shareStore());
    const items: Compartido[] = [];
    for (const [k, v] of filas) {
      if (v && (v.clase === "archivo" || v.clase === "texto")) items.push(v);
      await del(k, shareStore());
    }
    return items.sort((a, b) => a.ts - b.ts);
  } catch {
    return [];
  }
}
