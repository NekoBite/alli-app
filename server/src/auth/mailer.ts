import { env } from '../config/env.ts';

export interface Mailer {
  sendLoginCode(to: string, code: string): Promise<void>;
}

/** Development only. env.ts refuses to start production with this selected. */
class ConsoleMailer implements Mailer {
  async sendLoginCode(to: string, code: string): Promise<void> {
    console.log(`\n  [mailer] login code for ${to}: ${code}\n`);
  }
}

/**
 * TODO: wire to the chosen provider. Left unimplemented rather than half-built,
 * because a mailer that silently drops messages locks every user out with no
 * visible error — better to fail at boot than at 3am.
 */
class SmtpMailer implements Mailer {
  async sendLoginCode(): Promise<void> {
    throw new Error('SMTP mailer is not implemented yet. Set MAILER=console for local work.');
  }
}

export const mailer: Mailer = env.MAILER === 'smtp' ? new SmtpMailer() : new ConsoleMailer();
