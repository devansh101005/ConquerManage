import fs from 'fs';
import type {Task} from "./task.js"


const log_file = 'logs/worker.log' ;
export function logSuccess(task: Task) : void {


 const logLine = ` SUCCESS | Time: ${new Date().toISOString()} | Task ID: ${task.id} | Type: ${task.type} | Payload: ${JSON.stringify(task.payload)} | retries left: ${task.retries}\n`;
 
 fs.appendFileSync(log_file, logLine, "utf8");
 
 
}

export function logFailure(task: Task, errorMessage: string): void{
    const logLine = ` FAILURE | | Time: ${new Date().toISOString()} | Task ID: ${task.id} | ERROR: ${errorMessage} | Type: ${task.type} | Payload: ${JSON.stringify(task.payload)} | retries left: ${task.retries}\n`;
    fs.appendFileSync(log_file, logLine, "utf8");
    
}