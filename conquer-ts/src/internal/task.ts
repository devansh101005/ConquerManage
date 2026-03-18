export interface Task {
id:string;
type:string;
payload:Record<string,any>
retries:number;
}

export interface Metrics {
total_jobs_in_queue:number;
jobs_done:number;
jobs_failed:number;
}