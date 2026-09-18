import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState, Screen } from '@/components';
import { GAMES, isMinigameId, MinigameShell } from '@/features/garden/minigames';
import { useGardenStore } from '@/features/garden/store';

export default function MinigameScreen() {
  const router = useRouter();
  const { game, plotId } = useLocalSearchParams<{ game: string; plotId: string }>();
  const completeMinigame = useGardenStore((state) => state.completeMinigame);

  const Game = isMinigameId(game) ? GAMES[game] : undefined;
  if (!isMinigameId(game) || !Game || !plotId) {
    return (
      <Screen>
        <EmptyState
          title="No such minigame"
          body="This one is not built yet."
          actionLabel="Back to garden"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return <MinigameShell game={game} Game={Game} onWon={() => completeMinigame(plotId, game)} />;
}
