import { isMock } from '@/config/env';
import type { QuestSnapshot } from '@/features/quests/types';
import { delay, request } from './client';
import { mockQuests } from './mockQuests';

/**
 * The community quest. Read-only from the phone: contributions are counted by
 * the server from the actions it already handles (fertilising, minigame wins,
 * sun fills, the nightly settle, submitted runs), and the reward is paid by
 * the server when the week closes. There is nothing here to submit.
 */
export interface QuestApi {
  getWeekly(): Promise<QuestSnapshot>;
}

const live: QuestApi = {
  getWeekly: () => request('/v1/quests/weekly'),
};

const mock: QuestApi = {
  getWeekly: () => delay(mockQuests.snapshot(Date.now()), 300),
};

export const questApi: QuestApi = isMock ? mock : live;
