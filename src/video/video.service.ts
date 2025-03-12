import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { GenerateVideoDataReq } from './dto/generate-video-data-req'
import { AiService } from 'src/ai/ai.service'
import { StructuredOutputParser } from 'langchain/output_parsers'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { z } from 'zod'
import { ChatReq } from './dto/chat-req'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { CheckNSFWReq } from './dto/check-nsfw-req'
import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { DEFAULT_CACHE_TTL } from 'src/utils/constant'
import * as nsfwjs from 'nsfwjs'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { createHash } from 'crypto'
import * as path from 'path'
import { FfmpegService } from 'src/ffmpeg/ffmpeg.service'
import { TranscribeReq } from './dto/transcribe-req'
import {
    WorkerThreadsService,
    NSFWWorkerResult,
    DownloadWorkerResult,
    ExtractFramesWorkerResult
} from 'src/worker-threads/worker-threads.service'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'

@Injectable()
export class VideoService {
    private readonly logger = new Logger(VideoService.name)

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly aiService: AiService,
        private readonly ffmpegService: FfmpegService,
        private readonly workerThreadsService: WorkerThreadsService,
        private readonly configService: ConfigService<typeof Env, true>
    ) {}

    private generateCacheKey(prefix: string, data: any): string {
        const hash = createHash('md5').update(JSON.stringify(data)).digest('hex')
        return `${prefix}_${hash}`
    }

    async generateTranscribe(transcribeReq: TranscribeReq) {
        const cacheKey = this.generateCacheKey('transcribe', transcribeReq)

        // Try to get from cache
        const cachedResult = await this.cacheManager.get(cacheKey)
        if (cachedResult) {
            this.logger.log(`Retrieved transcript from cache with key: ${cacheKey}`)
            return cachedResult
        }

        const { videoUrl } = transcribeReq

        try {
            this.logger.log(`Transcribing video: ${videoUrl}`)

            // Create temporary directories for processing
            const tempDir = path.join(process.cwd(), 'temp')
            await fs.promises.mkdir(tempDir, { recursive: true })

            const soundId = uuidv4()
            const tempVideoPath = path.join(tempDir, `${soundId}.mp4`)
            const tempAudioPath = path.join(tempDir, `${soundId}.wav`)

            // Download the video from S3 using worker thread
            await this.workerThreadsService.runTask<DownloadWorkerResult>({
                type: 'download',
                data: {
                    videoUrl,
                    outputPath: tempVideoPath,
                    region: this.configService.get('AWS_REGION'),
                    accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
                    secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')
                }
            })

            this.logger.log(`Video downloaded to ${tempVideoPath}`)

            // Use worker thread to extract audio
            await this.workerThreadsService.runTask({
                type: 'transcribe',
                data: {
                    videoPath: tempVideoPath,
                    audioPath: tempAudioPath
                }
            })

            this.logger.log(`Audio extracted to ${tempAudioPath}`)

            const whisperLoader = this.aiService.getWhisperLoader(tempAudioPath)

            const document = await whisperLoader.load()

            const transcription = document[0].pageContent

            // Ensure we have a valid string transcription
            if (typeof transcription !== 'string') {
                throw new InternalServerErrorException('Failed to generate valid transcription')
            }

            this.logger.log(`Generated transcript: ${transcription}`)

            // Store result in cache
            await this.cacheManager.set(cacheKey, transcription, DEFAULT_CACHE_TTL)

            // Cleanup temporary file
            await this.cleanupTempVideoFiles(tempVideoPath)
            await this.cleanupTempAudioFiles(tempAudioPath)

            return {
                userId: transcribeReq.userId,
                orgId: transcribeReq.orgId,
                videoUrl: transcribeReq.videoUrl,
                transcript: transcription
            }
        } catch (error) {
            this.logger.error(`Error generate transcript: ${error.message}`)
            throw new InternalServerErrorException(`Failed to process generate transcript: ${error.message}`)
        }
    }

    async generateVideoData(generateVideoDataReq: GenerateVideoDataReq) {
        const cacheKey = this.generateCacheKey('generate_video_data', generateVideoDataReq)

        // Try to get from cache
        const cachedResult = await this.cacheManager.get(cacheKey)
        if (cachedResult) {
            this.logger.log(`Retrieved video data from cache with key: ${cacheKey}`)
            return cachedResult
        }

        const { transcript, categories } = generateVideoDataReq

        const videoDataResSchema = z
            .object({
                title: z
                    .optional(z.string())
                    .describe('A catchy and descriptive title for the video, maximum 100 characters'),
                description: z
                    .optional(z.string())
                    .describe('A detailed description of the video content that highlights key points, 2-3 paragraphs'),
                category: z
                    .optional(z.string())
                    .describe(
                        'The most suitable category for the video. If none of the provided categories match the content, suggest a new appropriate category name'
                    ),
                isNewCategory: z
                    .optional(z.boolean())
                    .describe(
                        'Set to true ONLY if creating a new category because none of the provided categories match the content. Set to false if selecting from the provided categories list'
                    )
            })
            .describe('The response from the AI model for generating video data')

        const parser = StructuredOutputParser.fromZodSchema(videoDataResSchema)

        const prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                `
                You are an AI assistant that helps content creators optimize their videos.
                
                Based on user's video transcript and current categories list, analyze the content and provide metadata.
                
                For the category selection:
                1. First evaluate if the transcript content matches ANY of the provided categories
                2. If there is a reasonable match with an existing category, use that category and set isNewCategory to false
                3. If NONE of the provided categories match the content, suggest a new appropriate category name and set isNewCategory to true
                4. Do not force the content into an existing category if it doesn't reasonably belong there
                
                Example: If transcript is about programming but categories only include "Math" and "History", you should suggest "Programming" or "Coding" as a new category with isNewCategory=true.

                Wrap the output in \`json\` tags\n{format_instructions}`
            ],
            ['user', '{transcript}'],
            ['user', 'Available categories: {categories}']
        ])

        const partialedPrompt = await prompt.partial({
            format_instructions: parser.getFormatInstructions()
        })

        const llm = this.aiService.getLLM()

        const chain = partialedPrompt.pipe(llm).pipe(parser)

        const res = await chain.invoke({
            transcript,
            categories
        })

        this.logger.log(`Generated video data: ${JSON.stringify(res)}`)

        // Store result in cache
        await this.cacheManager.set(cacheKey, res, DEFAULT_CACHE_TTL)

        return res
    }

    // This api will recieve video transcript to understand video context, conversation history and user's question to provide a response
    async chat(chatReq: ChatReq) {
        const cacheKey = this.generateCacheKey('chat', chatReq)

        // Try to get from cache
        const cachedResult = await this.cacheManager.get(cacheKey)
        if (cachedResult) {
            this.logger.log(`Retrieved chat response from cache with key: ${cacheKey}`)
            return cachedResult
        }

        const { question, conversation, transcript } = chatReq

        const prompt = ChatPromptTemplate.fromMessages([
            [
                'user',
                `You are an AI assistant that helps users understand video content.
                You will be provided with a video transcript and a conversation history.
                Use both the transcript and conversation history as context to answer the user's latest question.
                Maintain a helpful, conversational tone and be concise in your responses.
                If the answer is not available in the transcript or previous conversation, say so politely.
                
                {transcript}
                `
            ],
            new MessagesPlaceholder('conversation'),
            ['user', '{question}']
        ])

        const llm = this.aiService.getLLM()
        const chain = prompt.pipe(llm).pipe(new StringOutputParser())

        const res = await chain.invoke({
            transcript,
            conversation,
            question
        })

        this.logger.log(`Chat response: ${res}`)
        const result = { response: res }

        // Store result in cache
        await this.cacheManager.set(cacheKey, result, DEFAULT_CACHE_TTL)

        return result
    }

    async checkNSFW(checkNsfwReq: CheckNSFWReq) {
        const cacheKey = this.generateCacheKey('check_nsfw', checkNsfwReq)

        // Try to get from cache
        const cachedResult = await this.cacheManager.get(cacheKey)
        if (cachedResult) {
            this.logger.log(`Retrieved NSFW check result from cache with key: ${cacheKey}`)
            return cachedResult
        }

        const { videoUrl, videoId: originVideoId } = checkNsfwReq

        try {
            this.logger.log(`Processing video for NSFW content: ${videoUrl}`)

            // Create temporary directories for processing
            const tempDir = path.join(process.cwd(), 'temp')
            await fs.promises.mkdir(tempDir, { recursive: true })

            const videoId = uuidv4()
            const tempVideoPath = path.join(tempDir, `${videoId}.mp4`)
            const framesDir = path.join(tempDir, `${videoId}-frames`)
            await fs.promises.mkdir(framesDir, { recursive: true })

            // Download the video from S3 using worker thread
            await this.workerThreadsService.runTask<DownloadWorkerResult>({
                type: 'download',
                data: {
                    videoUrl,
                    outputPath: tempVideoPath,
                    region: this.configService.get('AWS_REGION'),
                    accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
                    secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')
                }
            })

            this.logger.log(`Video downloaded to ${tempVideoPath}`)

            // Extract frames from the video using worker thread
            const extractResult = await this.workerThreadsService.runTask<ExtractFramesWorkerResult>({
                type: 'extractFrames',
                data: {
                    videoPath: tempVideoPath,
                    outputDir: framesDir
                }
            })

            const frameFiles = extractResult.frameFiles
            this.logger.log(`Extracted ${frameFiles.length} frames for analysis`)

            // Process frames with worker threads in batches to avoid memory issues
            const batchSize = 20
            const predictions: nsfwjs.PredictionType[][] = []

            for (let i = 0; i < frameFiles.length; i += batchSize) {
                const batchFrames = frameFiles.slice(i, i + batchSize)
                this.logger.log(
                    `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(frameFiles.length / batchSize)}`
                )

                const batchResult = await this.workerThreadsService.runTask<NSFWWorkerResult>({
                    type: 'nsfw',
                    data: { frameFiles: batchFrames }
                })

                predictions.push(...batchResult.predictions)

                // Add a small delay between batches
                if (i + batchSize < frameFiles.length) {
                    await new Promise((resolve) => setTimeout(resolve, 200))
                }
            }

            // Analyze the results
            const result = this.analyzeNSFWPredictions(predictions)

            // Clean up temporary video file
            await this.cleanupTempVideoFiles(tempVideoPath, framesDir)

            const nsswResult = {
                videoId: originVideoId,
                dominantCategory: result.dominantCategory,
                categoryBreakdown: result.categoryBreakdown,
                isNSFW: ['Porn', 'Hentai', 'Sexy'].includes(result.dominantCategory)
            }

            // Store result in cache
            await this.cacheManager.set(cacheKey, nsswResult, DEFAULT_CACHE_TTL * 60 * 24)

            return nsswResult
        } catch (error) {
            this.logger.error(`Error checking NSFW content: ${error.message}`)
            throw new InternalServerErrorException(`Failed to process video for NSFW content: ${error.message}`)
        }
    }

    private async processFramesWithNSFW(
        frameFiles: string[],
        model: nsfwjs.NSFWJS,
        batchSize = 10 // Reduce batch size from 50 to 10
    ): Promise<nsfwjs.PredictionType[][]> {
        const predictions: nsfwjs.PredictionType[][] = []

        // Process frames in smaller batches with delays between batches
        for (let i = 0; i < frameFiles.length; i += batchSize) {
            const batch = frameFiles.slice(i, i + batchSize)
            this.logger.log(
                `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(frameFiles.length / batchSize)} (${batch.length} frames)`
            )

            // Process batch frames sequentially to reduce memory pressure
            for (const framePath of batch) {
                try {
                    // Load the image using tfjs-node
                    const imageTensor = await this.ffmpegService.convertImageToTensor(framePath)

                    // Classify the image using NSFW model
                    const prediction = await model.classify(imageTensor)

                    // Clean up tensor to prevent memory leaks
                    imageTensor.dispose()

                    predictions.push(prediction)

                    // Remove the frame file immediately after processing to free disk space
                    try {
                        await fs.promises.unlink(framePath)
                    } catch (unlinkError) {
                        this.logger.warn(`Could not delete frame ${framePath}: ${unlinkError.message}`)
                    }
                } catch (error) {
                    this.logger.error(`Error processing frame ${framePath}: ${error.message}`)
                    // Continue with next frame
                }

                // Add a small delay between frames to let the event loop breathe
                await new Promise((resolve) => setTimeout(resolve, 50))
            }

            // Add a longer delay between batches to allow event loop to process other tasks
            // This gives RabbitMQ connection a chance to maintain its heartbeat
            this.logger.log(`Completed batch ${Math.floor(i / batchSize) + 1}, pausing to maintain connections...`)
            await new Promise((resolve) => setTimeout(resolve, 500))

            // Force garbage collection if available (Node.js with --expose-gc flag)
            if (global.gc) {
                this.logger.log('Running garbage collection')
                global.gc()
            }
        }

        return predictions
    }

    private analyzeNSFWPredictions(predictions: nsfwjs.PredictionType[][]): {
        dominantCategory: string
        categoryBreakdown: Record<string, number>
    } {
        // Categories to track: Drawing, Hentai, Neutral, Porn, Sexy
        const categoryScores: Record<string, number> = {
            Drawing: 0,
            Hentai: 0,
            Neutral: 0,
            Porn: 0,
            Sexy: 0
        }

        // Count frames where each category was the top prediction
        for (const framePredictions of predictions) {
            if (framePredictions.length === 0) continue

            // Sort predictions for this frame to find the highest probability
            const sortedPredictions = [...framePredictions].sort((a, b) => b.probability - a.probability)
            const topCategory = sortedPredictions[0].className

            // Increment count for the top category
            categoryScores[topCategory] = (categoryScores[topCategory] || 0) + 1
        }

        // Find the category with the highest count
        let dominantCategory = 'Neutral' // Default
        let maxCount = 0

        for (const [category, count] of Object.entries(categoryScores)) {
            if (count > maxCount) {
                maxCount = count
                dominantCategory = category
            }
        }

        return {
            dominantCategory,
            categoryBreakdown: categoryScores
        }
    }

    private async cleanupTempVideoFiles(videoPath: string, framesDir?: string): Promise<void> {
        try {
            // Remove the temporary video file
            if (fs.existsSync(videoPath)) {
                await fs.promises.unlink(videoPath)
            }

            // Remove frame files and the frames directory
            if (framesDir && fs.existsSync(framesDir)) {
                const files = await fs.promises.readdir(framesDir)
                for (const file of files) {
                    await fs.promises.unlink(path.join(framesDir, file))
                }
                await fs.promises.rmdir(framesDir)
            }

            this.logger.log('Temporary files cleaned up successfully')
        } catch (error) {
            this.logger.warn(`Error cleaning up temporary files: ${error.message}`)
            // Non-critical error, so we don't throw
        }
    }

    private async cleanupTempAudioFiles(audioPath: string): Promise<void> {
        try {
            // Remove the temporary audio file
            if (fs.existsSync(audioPath)) {
                await fs.promises.unlink(audioPath)
            }
            this.logger.log('Temporary files cleaned up successfully')
        } catch (error) {
            this.logger.warn(`Error cleaning up temporary files: ${error.message}`)
            // Non-critical error, so we don't throw
        }
    }
}
