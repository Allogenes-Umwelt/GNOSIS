import { get, set, del, createStore, type UseStore } from "idb-keyval";

/**
 * Blob vault — source binaries (PDFs, images) live here, keyed, in their
 * own IndexedDB store, apart from the JSON graph. Kept local; a backend
 * swap later replaces only this module's callers behind the service.
 */

let store: UseStore | null = null;
function blobStore(): UseStore {
  if (!store) store = createStore("umwelt-blobs", "blobs");
  return store;
}

export function putBlob(key: string, blob: Blob): Promise<void> {
  return set(key, blob, blobStore());
}

export function getBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key, blobStore());
}

export function delBlob(key: string): Promise<void> {
  return del(key, blobStore());
}
