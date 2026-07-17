import { resetRemaining } from '../services/playerService.js';

// Runs every day at 00:00 Asia/Taipei and resets every player's remaining
// attempts back to the daily maximum. Power is left untouched.
const DAILY_RESET_CRON = '0 0 * * *';

async function runDailyReset() {
  await resetRemaining();
  console.info('Daily player data reset to defaults.');
}

export { DAILY_RESET_CRON, runDailyReset };
