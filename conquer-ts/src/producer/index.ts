import express from "express"
import crypto from "crypto"
import {createRedisClient} from "../config/redis.js"
import type {Task} from "../internal/task.js"

const app =express();


app.use(express.json());

const redis = createRedisClient();

const PORT =process.env.PORT_PRODUCER || 3000;


app.post("/enqueue",async (req,res)=> {

    try {
        const {type,payload,retries}=req.body;

        if(!type || typeof type !== "string"){
            res.status(400).json({error:"type is required and must be a non empy string"})
            return;
        }

        if(retries === undefined || typeof retries !== "number" || retries <0) {
            res.status(400).json({error:"retries is required and must be a number greater than 0"})
            return;
        }

        if(!payload || typeof payload !== "object" || Array.isArray(payload)){
            res.status(400).json({error:"payload is required and must be a object"})
            return;
        }
        if(type==="send_email"){

            if(!payload.to || !payload.subject){
                res.status(400).json({error:"send_email requires 'to' and 'subject' "});
                return;
            }
            }

            const task: Task ={
                id:crypto.randomUUID(),
                type,
                payload,
                retries,
            };

            await redis.rpush("task_queue", JSON.stringify(task));

            res.status(200).json({
                message:`Task ${task.type} enqued successfully`,
                task_id: task.id,
            })
    }

    catch (error){
        res.status(500).json({error:"Failed to enqueue task"})
    }



})

//is redis ok (health check)

    app.get("/health",async (req,res)=> {
        try {
            await redis.ping();
            res.status(200).json({status:"OK"});
        }
        catch (error){
            res.status(500).json({status:"error", message:"Redis connection failed"})
        }
    })
    app.listen(PORT, () => {
        console.log(`Producer server running on port ${PORT}`)
    })