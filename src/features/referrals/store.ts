import { create } from 'zustand';

import { referralApi } from '@/services/api';
import { defaultRates, type ReferralRates } from './rules';
import type { Downline, ProgramDetail, ReferralHub, ReferralProgramId } from './types';

type ReferralState = {
  hub?: ReferralHub;
  /** The commission rates in force. The code defaults until the server's have loaded. */
  rates: ReferralRates;
  details: Partial<Record<ReferralProgramId, ProgramDetail>>;
  downlines: Partial<Record<ReferralProgramId, Downline>>;
  /** Downline view last chosen (6.6 list / 6.6b chart). Remembered for the session. */
  treeView: 'list' | 'chart';
  loading: boolean;
  error?: string;

  refreshHub: () => Promise<void>;
  loadRates: () => Promise<void>;
  loadProgram: (program: ReferralProgramId) => Promise<void>;
  loadDownline: (program: ReferralProgramId) => Promise<void>;
  setTreeView: (view: 'list' | 'chart') => void;
};

export const useReferralStore = create<ReferralState>((set) => ({
  rates: defaultRates(),
  details: {},
  downlines: {},
  treeView: 'list',
  loading: false,

  async loadRates() {
    try {
      set({ rates: await referralApi.getRates() });
    } catch {
      // Keep what is on screen. The defaults are a fallback, not an error worth showing.
    }
  },

  async refreshHub() {
    set({ loading: true, error: undefined });
    try {
      set({ hub: await referralApi.getHub(), loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async loadProgram(program) {
    set({ error: undefined });
    try {
      const detail = await referralApi.getProgram(program);
      set((s) => ({ details: { ...s.details, [program]: detail } }));
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async loadDownline(program) {
    set({ error: undefined });
    try {
      const downline = await referralApi.getDownline(program);
      set((s) => ({ downlines: { ...s.downlines, [program]: downline } }));
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  setTreeView(treeView) {
    set({ treeView });
  },
}));
