import express from "express"
import {createRedisClient} from "../config/redis.js"
import type {Task} from "../internal/task.js"
import { ProcessTask } from "../internal/processor.js"
import { logSuccess } from "../internal/logger.js"
import { logFailure } from "../internal/logger.js"
import type { Redis } from "ioredis"

// Each worker loop gets its OWN connection (created further down). A blocking
// BLPOP occupies its connection for the full timeout, so loops sharing one
// client serialise instead of running in parallel.
const redisMetrics = createRedisClient();


let jobs_done=0
let jobs_failed=0
let total_jobs_in_queue=0
let isShuttingDown=false

// How long each BLPOP blocks before returning null so the loop can re-check
// isShuttingDown. Still a real blocking call - no polling, no CPU burn.
// This is the max delay between a shutdown signal and a worker noticing it.
const BLOCK_TIMEOUT_SECONDS = 5;

// Must stay under Docker's default 10s grace period, or SIGKILL wins.
const SHUTDOWN_TIMEOUT_MS = 8000;


export async function runWorker(client: Redis) :Promise<void> {

    while(!isShuttingDown){
        try{
            const result =await client.blpop("task_queue",BLOCK_TIMEOUT_SECONDS);

            if(!result) continue;

            const task: Task =JSON.parse(result[1])

            try {
                ProcessTask(task);
                jobs_done++;
                logSuccess(task);
            } catch (err){
                jobs_failed++;
                const errorMsg= err instanceof Error ? err.message : String(err);
                logFailure(task, errorMsg);

                if (task.retries>0){
                    task.retries--;
                    await client.rpush("task_queue", JSON.stringify(task))
                } else {
                    await client.rpush("task_queue:dead", JSON.stringify(task));
                }
            }
        } catch (err){
            console.error("Worker error:",err);
        }
    }

}

const app = express();
const PORT = process.env.PORT_WORKER || 3001;

app.get("/metrics", async (_req, res) => {
  const total_jobs_in_queue = await redisMetrics.llen("task_queue");
  res.json({ total_jobs_in_queue, jobs_done, jobs_failed });
});

app.get("/health", async (_req, res) => {
  try {
    await redisMetrics.ping();
    res.json({ status: "ok" });
  } catch {
    res.status(500).json({ status: "error", message: "Redis not reachable" });
  }
});

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 3;

// One connection per loop so their BLPOPs actually run in parallel,
// and so they all wake from a blocking call at the same time on shutdown.
const workerClients: Redis[] = [];
const workers: Promise<void>[] = [];
for (let i = 0; i < concurrency; i++) {
  const client = createRedisClient();
  workerClients.push(client);
  workers.push(runWorker(client));
}

console.log(`Worker started with ${concurrency} concurrent loops`);

const server = app.listen(PORT, () => {
  console.log(`Worker metrics server running on port ${PORT}`);
});

// --- Graceful Shutdown ---
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return; // ignore repeat signals while already draining
  isShuttingDown = true;
  console.log(`${signal} received, draining workers...`);

  // Hard deadline. If a task hangs we still exit on our own terms
  // instead of waiting to be SIGKILLed mid-write.
  const forceExit = setTimeout(() => {
    console.error("Drain timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  server.close(); // stop accepting new /metrics and /health connections

  // Each loop exits within BLOCK_TIMEOUT_SECONDS once the flag is set.
  await Promise.all(workers);

  // One client per worker loop, plus the one serving /metrics and /health.
  await Promise.all([...workerClients.map((c) => c.quit()), redisMetrics.quit()]);

  clearTimeout(forceExit);
  console.log(`Shutdown complete. done=${jobs_done} failed=${jobs_failed}`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));   // Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM")); // docker stop, system stop 

