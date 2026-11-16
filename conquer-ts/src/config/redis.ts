// Named import, not default: ioredis is CJS but ships ESM-style .d.ts, so a
// default import resolves to the module namespace rather than the class.
import { Redis } from "ioredis";
import dotenv from "dotenv"

dotenv.config()

export function createRedisClient(): Redis{
const url= process.env.REDIS_URL;

if(!url) {
    throw new Error("REDIS_URL is not defined in env ")
}
return new Redis(url);
    
}
