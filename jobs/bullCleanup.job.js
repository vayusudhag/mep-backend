import cron from "node-cron";
import Bull from "../models/Bull.model.js";

const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export const startBullCleanupJob = () => {
  // Run daily at 02:00
  return cron.schedule("0 2 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - FIFTEEN_DAYS_MS);
      const result = await Bull.deleteMany({
        isDeleted: true,
        deletionRequestedAt: { $lte: cutoff },
      });
      if (result?.deletedCount) {
        console.log(`Bull cleanup: deleted ${result.deletedCount} records`);
      }
    } catch (err) {
      console.error("Bull cleanup failed:", err.message || err);
    }
  });
};
