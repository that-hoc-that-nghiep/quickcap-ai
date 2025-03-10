export const Env: Record<string, string> = {
    OPENAI_API_KEY: 'OPENAI_API_KEY',
    OPENAI_API_URL: 'OPENAI_API_URL',
    AWS_ACCESS_KEY_ID: 'AWS_ACCESS_KEY_ID',
    AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_ACCESS_KEY',
    AWS_REGION: 'AWS_REGION',
    RABBITMQ_URL: 'RABBITMQ_URL',
    QUEUE_NAME: 'QUEUE_NAME'
}

// cache 10s
export const DEFAULT_CACHE_TTL = 60 * 1000

export const SERVICE_NAME = 'quickcap-ai'
export const SERVICE_NAME_2 = 'quickcap-nswf'
