import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { Worker } from 'worker_threads'
import * as os from 'os'
import * as nsfwjs from 'nsfwjs'
import { WORKER_PATH } from 'src/utils/constant'

export interface WorkerTask {
    type: 'transcribe' | 'nsfw' | 'download' | 'extractFrames'
    data: any
}

export interface TranscribeWorkerResult {
    audioPath: string
}

export interface NSFWWorkerResult {
    predictions: nsfwjs.PredictionType[][]
}

export interface DownloadWorkerResult {
    filePath: string
}

export interface ExtractFramesWorkerResult {
    frameFiles: string[]
}

export type WorkerResult = TranscribeWorkerResult | NSFWWorkerResult | DownloadWorkerResult | ExtractFramesWorkerResult

@Injectable()
export class WorkerThreadsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(WorkerThreadsService.name)
    private workers: Worker[] = []
    private taskQueue: Array<{ resolve: (value: any) => void; reject: (reason: Error) => void; task: WorkerTask }> = []
    private availableWorkers: Worker[] = []
    private readonly maxWorkers: number

    constructor() {
        // Use either all cores - 1 (keep one for main thread) or at least 1 worker
        this.maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 3)) // Max 3 workers (to leave 1 core for main thread)
        this.logger.log(`Initializing worker pool with ${this.maxWorkers} workers`)
    }

    onModuleInit() {
        this.initializeWorkers()
    }

    async onModuleDestroy() {
        await this.cleanup()
    }

    private initializeWorkers() {
        for (let i = 0; i < this.maxWorkers; i++) {
            // Use the configured worker path
            this.logger.log(`Creating worker with path: ${WORKER_PATH}`)

            const worker = new Worker(WORKER_PATH)
            this.logger.log(`Created worker #${i + 1}`)

            worker.on('message', (result) => {
                this.handleWorkerMessage(worker, result)
            })

            worker.on('error', (error) => {
                this.logger.error(`Worker error: ${error.message}`)
                // Try to restart the failed worker
                this.restartWorker(worker, i)
            })

            worker.on('exit', (code) => {
                if (code !== 0) {
                    this.logger.warn(`Worker exited with code ${code}, restarting...`)
                    this.restartWorker(worker, i)
                }
            })

            this.workers.push(worker)
            this.availableWorkers.push(worker)
        }
    }

    private restartWorker(oldWorker: Worker, index: number) {
        // Remove old worker from arrays
        this.workers = this.workers.filter((w) => w !== oldWorker)
        this.availableWorkers = this.availableWorkers.filter((w) => w !== oldWorker)

        // Use the configured worker path
        const newWorker = new Worker(WORKER_PATH)
        this.logger.log(`Restarted worker #${index + 1}`)

        newWorker.on('message', (result) => {
            this.handleWorkerMessage(newWorker, result)
        })

        newWorker.on('error', (error) => {
            this.logger.error(`Worker error: ${error.message}`)
            this.restartWorker(newWorker, index)
        })

        newWorker.on('exit', (code) => {
            if (code !== 0) {
                this.logger.warn(`Worker exited with code ${code}, restarting...`)
                this.restartWorker(newWorker, index)
            }
        })

        // Add new worker to arrays
        this.workers[index] = newWorker
        this.availableWorkers.push(newWorker)

        // Process next task if any
        this.processNextTask()
    }

    private handleWorkerMessage(worker: Worker, result: any) {
        this.logger.log(`Received message from worker: ${JSON.stringify(result)}`)
        // Worker is now available
        this.availableWorkers.push(worker)

        // Process the next task in queue
        this.processNextTask()
    }

    private processNextTask() {
        if (this.taskQueue.length === 0 || this.availableWorkers.length === 0) {
            return
        }

        const worker = this.availableWorkers.shift()!
        const nextTask = this.taskQueue.shift()
        if (!nextTask) return

        const { resolve, reject, task } = nextTask

        worker.once('message', (result) => {
            if (result.error) {
                reject(new Error(result.error))
            } else {
                resolve(result.data)
            }
        })

        worker.postMessage(task)
    }

    async runTask<T extends WorkerResult>(task: WorkerTask): Promise<T> {
        return new Promise((resolve, reject) => {
            this.taskQueue.push({ resolve, reject, task })
            this.processNextTask()
        })
    }

    async cleanup() {
        this.logger.log('Cleaning up worker threads...')
        await Promise.all(this.workers.map((worker) => worker.terminate()))
        this.workers = []
        this.availableWorkers = []
        this.logger.log('Worker threads terminated')
    }
}
