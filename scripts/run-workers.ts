/**
 * Distributed Worker Runner
 * 
 * Starts BullMQ workers for distributed payment processing
 * Multiple instances can run in parallel safely
 * 
 * Usage:
 *   npx tsx scripts/run-workers.ts
 * 
 * Environment:
 *   - REDIS_URL or UPSTASH_REDIS_URL (required)
 *   - NODE_ENV (optional, defaults to development)
 */

import { startAllWorkers, stopAllWorkers } from '@/lib/workers';
import { getQueueStats, shutdownQueues } from '@/lib/queue';
import { shutdownLockSystem } from '@/lib/distributed-lock';

let workers: any[] = [];
let isShuttingDown = false;

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    console.log('[Worker] Already shutting down...');
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new jobs
    await stopAllWorkers(workers);
    
    // Close queues
    await shutdownQueues();
    
    // Close lock system
    await shutdownLockSystem();
    
    console.log('[Worker] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Worker] Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Log stats periodically
function logStats() {
  getQueueStats().then((stats) => {
    console.log('\n[Queue Stats]'.padEnd(20, '='));
    stats.forEach((stat) => {
      console.log(
        `${stat.name.padEnd(25)} | ` +
        `Waiting: ${stat.waiting.toString().padStart(3)} | ` +
        `Active: ${stat.active.toString().padStart(3)} | ` +
        `Completed: ${stat.completed.toString().padStart(5)} | ` +
        `Failed: ${stat.failed.toString().padStart(3)} | ` +
        `Delayed: ${stat.delayed.toString().padStart(3)}`
      );
    });
    console.log('='.repeat(80));
  }).catch((error) => {
    console.error('[Worker] Error getting stats:', error);
  });
}

// Start workers
async function main() {
  console.log('='.repeat(80));
  console.log('🚀 Distributed Payment Workers Starting');
  console.log('='.repeat(80));
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Worker ID: ${process.env.HOSTNAME || 'unknown'}-${process.pid}`);
  console.log(`Redis: ${process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'localhost'}`);
  console.log(`Simulation Mode: ${process.env.PAYMENT_SIMULATION_MODE === 'true' ? 'ON' : 'OFF'}`);
  console.log('='.repeat(80));
  console.log();
  
  // Check Redis connection
  if (!process.env.UPSTASH_REDIS_URL && !process.env.REDIS_URL) {
    console.warn('⚠️  WARNING: No Redis URL configured. Workers will not function properly.');
    console.warn('   Set UPSTASH_REDIS_URL or REDIS_URL environment variable.');
  }
  
  // Start all workers
  workers = startAllWorkers();
  
  // Log stats every minute
  setInterval(logStats, 60000);
  
  // Initial stats after 5 seconds
  setTimeout(logStats, 5000);
  
  console.log('\n✅ Workers started successfully');
  console.log('Press Ctrl+C to stop\n');
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
