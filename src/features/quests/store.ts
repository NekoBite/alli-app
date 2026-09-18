import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { create } from 'zustand';

import { questApi } from '@/services/api';
import { shareText } from './quests';
import type { QuestSnapshot } from './types';

type QuestState = {
  snapshot?: QuestSnapshot;
  loading: boolean;
  error?: string;

  refresh: () => Promise<void>;
  /**
   * Opens the share sheet with where the community stands. Where sharing is
   * not available the text is copied instead, and the result says which.
   */
  share: () => Promise<'shared' | 'copied' | 'nothing'>;
};

export const useQuestStore = create<QuestState>((set, get) => ({
  loading: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      set({ snapshot: await questApi.getWeekly(), loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async share() {
    const { snapshot } = get();
    if (!snapshot) return 'nothing';
    const message = shareText(snapshot.current, snapshot.serverTime);
    try {
      const result = await Share.share({ message });
      return result.action === Share.dismissedAction ? 'nothing' : 'shared';
    } catch {
      await Clipboard.setStringAsync(message);
      return 'copied';
    }
  },
}));
