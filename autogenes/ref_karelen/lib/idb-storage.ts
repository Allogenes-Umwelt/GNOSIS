import { del, get, set } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

/**
 * IndexedDB storage for persisted stores — more capacity and better
 * eviction behavior than localStorage on mobile Safari. Lazily migrates
 * any legacy localStorage value on first read, then removes it so the
 * two never diverge.
 */

const hasIDB = () => typeof indexedDB !== "undefined";

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    if (!hasIDB()) return null;
    const value = await get<string>(name);
    if (value !== undefined) return value;
    if (typeof localStorage !== "undefined") {
      const legacy = localStorage.getItem(name);
      if (legacy !== null) {
        await set(name, legacy);
        localStorage.removeItem(name);
        return legacy;
      }
    }
    return null;
  },
  setItem: async (name, value) => {
    if (hasIDB()) await set(name, value);
  },
  removeItem: async (name) => {
    if (hasIDB()) await del(name);
  },
};
