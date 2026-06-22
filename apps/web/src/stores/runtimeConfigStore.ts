import { create } from 'zustand';

/** Server runtime configuration the client learns once at boot (operator/runtime, not user settings). */
export interface RuntimeConfigState {
  /** Whether the server has content logging enabled (mirrors ANVIKA_LOG_CONTENT). Default false. */
  logContent: boolean;
  /** Set the resolved content-logging flag (called once after the boot health fetch). */
  setLogContent: (logContent: boolean) => void;
}

/** Holds the resolved server runtime config; read by the notification log channel. */
export const useRuntimeConfigStore = create<RuntimeConfigState>((set) => ({
  logContent: false,
  setLogContent: (logContent) => set({ logContent }),
}));
