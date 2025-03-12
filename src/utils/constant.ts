import * as path from 'path'

export const Env: Record<string, string> = {
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    OPENAI_API_URL: 'OPENAI_API_URL',
    AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
    AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
    AWS_REGION: 'AWS_REGION',
    RABBITMQ_URL: 'RABBITMQ_URL',
    QUEUE_NAME: 'QUEUE_NAME'
}

// Add worker path to environment variables
export const WORKER_PATH = path.join(process.cwd(), 'dist', 'worker-threads', 'worker.js')

// cache 10s
export const DEFAULT_CACHE_TTL = 60 * 60 * 3 // 3 hours

export const SERVICE_NAME = 'quickcap-ai'
export const SERVICE_NAME_2 = 'quickcap-nswf'
