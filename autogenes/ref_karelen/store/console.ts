import { create } from "zustand";

/** Console UI state — openable from anywhere (hero greeting, shortcuts). */
interface ConsoleState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useConsoleStore = create<ConsoleState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
