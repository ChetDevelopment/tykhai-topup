/**
 * Background Worker Runner
 * 
 * Starts the payment worker in the background
 * Run this separately from the main Next.js server
 * 
 * Usage:
 *   npx tsx scripts/run-worker.ts
 */

import { startPaymentWorker, stopPaymentWorker, getWorkerStats } from "@/lib/payment-worker";

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Worker] Received SIGINT, shutting down gracefully...");
  stopPaymentWorker();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Worker] Received SIGTERM, shutting down gracefully...");
  stopPaymentWorker();
  process.exit(0);
});

// Start worker
async function main() {
  console.log("=".repeat(60));
  console.log("🚀 Payment Worker Starting");
  console.log("=".repeat(60));
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Simulation Mode: ${process.env.PAYMENT_SIMULATION_MODE === "true" ? "ON" : "OFF"}`);
  console.log("=".repeat(60));
  console.log();

  // Log stats periodically
  setInterval(() => {
    const stats = getWorkerStats();
    console.log("[Worker] Stats:", stats);
  }, 60000); // Every minute

  // Start the worker
  await startPaymentWorker();
}

main().catch((error) => {
  console.error("[Worker] Fatal error:", error);
  process.exit(1);
});
