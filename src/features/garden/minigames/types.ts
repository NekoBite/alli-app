/** What every minigame receives from the shell. */
export type GameProps = {
  width: number;
  height: number;
  /** When the shell will call time. The game stops spawning past it. */
  deadline: number;
  onFinish: (success: boolean) => void;
};
