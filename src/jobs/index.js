import cron from 'node-cron';
import { DAILY_RESET_CRON, runDailyReset } from './dailyReset.js';
import { MONTHLY_RESET_CRON, resetMonthlyData } from './monthlyReset.js';

// Registers every scheduled job. All jobs run on Taiwan time (node-cron uses
// IANA time zones), and each catches its own errors so one failing job never
// affects the others.
function registerJobs() {
  cron.schedule(DAILY_RESET_CRON, async () => {
    try {
      await runDailyReset();
    } catch (error) {
      console.error('Daily reset failed:', error);
    }
  }, { timezone: 'Asia/Taipei' });

  cron.schedule(MONTHLY_RESET_CRON, async () => {
    try {
      await resetMonthlyData();
    } catch (error) {
      console.error('Monthly reset failed:', error);
    }
  }, { timezone: 'Asia/Taipei' });
}

export { registerJobs };
