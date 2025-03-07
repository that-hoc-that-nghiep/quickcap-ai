import { Inject, Injectable, Logger } from '@nestjs/common'
import { GenerateVideoDataReq } from './dto/generate-video-data-req'
import { AiService } from 'src/ai/ai.service'
import { StructuredOutputParser } from 'langchain/output_parsers'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { z } from 'zod'
import { ChatReq } from './dto/chat-req'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { CheckNSFWReq } from './dto/check-nsfw-req'
import * as fs from 'fs'
import * as path from 'path'
import * as ffmpeg from 'fluent-ffmpeg'
import * as tf from '@tensorflow/tfjs'
import * as jpeg from 'jpeg-js'
import { v4 as uuidv4 } from 'uuid'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { ConfigService } from '@nestjs/config'
import { DEFAULT_CACHE_TTL, Env } from 'src/utils/constant'
import * as nsfwjs from 'nsfwjs'
import ffmpegPath from 'ffmpeg-static'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { createHash } from 'crypto'

@Injectable()
export class VideoService {
    private readonly logger = new Logger(VideoService.name)
    private s3Client: S3Client

    constructor(
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly aiService: AiService,
        private readonly configService: ConfigService<typeof Env, true>
    ) {
        // Initialize S3 client
        this.s3Client = new S3Client({
            region: this.configService.get('AWS_REGION'),
            credentials: {
                accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')
            }
        })

        // Set the ffmpeg path to use the bundled binary
        if (ffmpegPath) {
            this.logger.log(`Using ffmpeg from: ${ffmpegPath}`)
            ffmpeg.setFfmpegPath(ffmpegPath)
        } else {
            this.logger.warn('ffmpeg-static path not found, using system ffmpeg if available')
        }
    }

    private generateCacheKey(prefix: string, data: any): string {
        const hash = createHash('md5').update(JSON.stringify(data)).digest('hex')
        return `${prefix}_${hash}`
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

        const { videoUrl } = checkNsfwReq
        const checkModel = await this.aiService.getNSFWDetectModel()

        try {
            this.logger.log(`Processing video for NSFW content: ${videoUrl}`)

            // Create temporary directories for processing
            const tempDir = path.join(process.cwd(), 'temp')
            await fs.promises.mkdir(tempDir, { recursive: true })

            const videoId = uuidv4()
            const tempVideoPath = path.join(tempDir, `${videoId}.mp4`)
            const framesDir = path.join(tempDir, `${videoId}-frames`)
            await fs.promises.mkdir(framesDir, { recursive: true })

            // Download the video from S3
            await this.downloadVideoFromS3(videoUrl, tempVideoPath)
            this.logger.log(`Video downloaded to ${tempVideoPath}`)

            // Extract frames from the video
            const frameFiles = await this.extractFrames(tempVideoPath, framesDir)
            this.logger.log(`Extracted ${frameFiles.length} frames for analysis`)

            // Process frames with NSFW detection
            const predictions = await this.processFramesWithNSFW(frameFiles, checkModel)

            // Analyze the results
            const result = this.analyzeNSFWPredictions(predictions)

            // Clean up temporary files
            await this.cleanupTempFiles(tempVideoPath, framesDir)

            const nsswResult = {
                dominantCategory: result.dominantCategory,
                categoryBreakdown: result.categoryBreakdown,
                isNSFW: ['Porn', 'Hentai', 'Sexy'].includes(result.dominantCategory)
            }

            // Store result in cache
            await this.cacheManager.set(cacheKey, nsswResult, DEFAULT_CACHE_TTL)

            return nsswResult
        } catch (error) {
            this.logger.error(`Error checking NSFW content: ${error.message}`)
            throw new Error(`Failed to process video for NSFW content: ${error.message}`)
        }
    }

    private async downloadVideoFromS3(videoUrl: string, outputPath: string): Promise<void> {
        try {
            // Parse the S3 URL to extract bucket and key
            const videoUrlObj = new URL(videoUrl)
            const bucketName = videoUrlObj.hostname.split('.')[0]
            const objectKey = videoUrlObj.pathname.substring(1) // Remove leading slash

            // Get the object from S3
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey
            })

            const response = await this.s3Client.send(command)

            // Create a write stream to save the video locally
            const writeStream = fs.createWriteStream(outputPath)

            // Save the video stream to a file
            if (response.Body) {
                return new Promise((resolve, reject) => {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore - S3 response body is a readable stream
                    response.Body.pipe(writeStream)
                        .on('finish', () => resolve())
                        .on('error', reject)
                })
            } else {
                throw new Error('Empty response body from S3')
            }
        } catch (error) {
            this.logger.error(`Error downloading video from S3: ${error.message}`)
            throw error
        }
    }

    private async extractFrames(videoPath: string, outputDir: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.logger.log(`Starting frame extraction from ${videoPath} to ${outputDir}`)

            ffmpeg(videoPath)
                .outputOptions([
                    // Extract every 12th frame and resize to 360p height
                    '-vf',
                    'select=not(mod(n\\,12)),scale=-1:360',
                    '-vsync',
                    'vfr', // Variable framerate for selected frames
                    '-q:v',
                    '3' // Quality setting (lower means better quality)
                ])
                .output(path.join(outputDir, 'frame-%04d.jpg'))
                .on('start', (commandLine) => {
                    this.logger.log(`ffmpeg started with command: ${commandLine}`)
                })
                .on('end', async () => {
                    try {
                        this.logger.log(`Frame extraction completed`)
                        const files = await fs.promises.readdir(outputDir)
                        const frameFiles = files
                            .filter((file) => file.startsWith('frame-') && file.endsWith('.jpg'))
                            .map((file) => path.join(outputDir, file))
                            .sort() // Sort to ensure frames are processed in order

                        this.logger.log(`Found ${frameFiles.length} extracted frames`)
                        resolve(frameFiles)
                    } catch (err) {
                        this.logger.error(`Error reading frames directory: ${err.message}`)
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(err)
                    }
                })
                .on('error', (err) => {
                    this.logger.error(`Error extracting frames: ${err.message}`)
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                    reject(err)
                })
                .run()
        })
    }

    private async convertImageToTensor(imagePath: string): Promise<tf.Tensor3D> {
        // Load the image using tfjs
        const imageBuffer = await fs.promises.readFile(imagePath)
        const image = jpeg.decode(imageBuffer, { useTArray: true })

        const numChannels = 3
        const numPixels = image.width * image.height
        const values = new Int32Array(numPixels * numChannels)

        for (let i = 0; i < numPixels; i++)
            for (let c = 0; c < numChannels; ++c) values[i * numChannels + c] = image.data[i * 4 + c]

        return tf.tensor3d(values, [image.height, image.width, numChannels], 'int32')
    }

    private async processFramesWithNSFW(
        frameFiles: string[],
        model: nsfwjs.NSFWJS
    ): Promise<nsfwjs.PredictionType[][]> {
        const predictions: nsfwjs.PredictionType[][] = []

        for (const framePath of frameFiles) {
            try {
                // Load the image using tfjs-node
                const imageTensor = await this.convertImageToTensor(framePath)

                // Classify the image using NSFW model
                const framePredictions = await model.classify(imageTensor)
                predictions.push(framePredictions)

                // this.logger.debug(`Processed frame ${path.basename(framePath)}`)
            } catch (error) {
                this.logger.error(`Error processing frame ${framePath}: ${error.message}`)
                // Continue with other frames even if one fails
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

    private async cleanupTempFiles(videoPath: string, framesDir: string): Promise<void> {
        try {
            // Remove the temporary video file
            if (fs.existsSync(videoPath)) {
                await fs.promises.unlink(videoPath)
            }

            // Remove frame files and the frames directory
            if (fs.existsSync(framesDir)) {
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
}
