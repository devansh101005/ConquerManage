import express from "express"
import {createRedisClient} from "../config/redis.js"
import type {Task} from "../internal/task.js"
import { ProcessTask } from "../internal/processor.js"
import { logSuccess } from "../internal/logger.js"
import { logFailure } from "../internal/logger.js"

const redis = createRedisClient();
const redisMetrics = createRedisClient();


let jobs_done=0
let jobs_failed=0
let total_jobs_in_queue=0
let isShuttingDown=false


export async function runWorker() :Promise<void> {

    while(!isShuttingDown){
        try{
            const result =await redis.blpop("task_queue",0);

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
                    await redis.rpush("task_queue", JSON.stringify(task))
                } else {
                    await redis.rpush("task_queue:dead", JSON.stringify(task));
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

// Create an array of worker promises and run them all
const workers: Promise<void>[] = [];
for (let i = 0; i < concurrency; i++) {
  workers.push(runWorker());
}

console.log(`Worker started with ${concurrency} concurrent loops`);

app.listen(PORT, () => {
  console.log(`Worker metrics server running on port ${PORT}`);
});

// --- Graceful Shutdown ---
process.on("SIGINT", async () => {
  console.log("Shutting down workers");
  isShuttingDown = true;
  await Promise.all(workers);  
  await redis.quit();          
  process.exit(0);
});

