// Monthly scheduler (reserved).
//
// Runs on the first day of every month at 00:00 Asia/Taipei. For now it does
// NOT reset any data — it only logs that it ran, leaving a hook for future
// monthly bookkeeping (e.g. seasonal stats) without touching player data.
const MONTHLY_RESET_CRON = '0 0 1 * *';

async function resetMonthlyData() {
  // Intentionally a no-op for now; reserved for future monthly logic.
  console.info('Monthly data reset completed.');
}

export { MONTHLY_RESET_CRON, resetMonthlyData };
