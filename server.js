import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";
import { startBullCleanupJob } from "./jobs/bullCleanup.job.js";

app.get("/health", (req, res) => {
  res.send("MEP API is running!");
});

const PORT = process.env.PORT || 3000;

let server;
let cleanupJob;
let shuttingDown = false;

const start = async () => {
  // Connect to the database BEFORE accepting traffic.
  await connectDB();

  cleanupJob = startBullCleanupJob();

  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Gracefully drain in-flight requests, stop the cron, and close the DB.
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Force-exit if graceful shutdown hangs.
  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (cleanupJob) cleanupJob.stop();

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }

    await mongoose.connection.close(false);
    console.log("Shutdown complete.");
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

["SIGTERM", "SIGINT"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  shutdown("uncaughtException");
});

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
