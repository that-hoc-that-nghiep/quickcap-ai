import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'
import { spawn } from 'child_process'

@Injectable()
export class S3Service {
    private readonly logger = new Logger(S3Service.name)
    private s3Client: S3Client

    constructor(private readonly configService: ConfigService<typeof Env, true>) {
        // Initialize S3 client
        this.s3Client = new S3Client({
            region: this.configService.get('AWS_REGION'),
            credentials: {
                accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY')
            }
        })
    }

    async downloadFromS3(videoUrl: string, outputPath: string): Promise<void> {
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

    async extractAudioFromS3(videoUrl: string, audioOutputPath: string): Promise<void> {
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

            if (!response.Body) {
                throw new Error('Empty response body from S3')
            }

            // Create FFmpeg process to extract audio
            const ffmpeg = spawn('ffmpeg', [
                '-i',
                'pipe:0', // Input from stdin
                '-vn', // Disable video
                '-acodec',
                'libmp3lame', // Audio codec
                '-ar',
                '44100', // Sample rate
                '-ac',
                '2', // Channels
                '-b:a',
                '192k', // Bitrate
                '-f',
                'mp3', // Format
                audioOutputPath // Output file
            ])

            return new Promise((resolve, reject) => {
                ffmpeg.stderr.on('data', (data) => {
                    // FFmpeg logs to stderr, but we don't want to treat all as errors
                    this.logger.debug(`FFmpeg: ${data.toString()}`)
                })

                ffmpeg.on('error', (error) => {
                    this.logger.error(`FFmpeg error: ${error.message}`)
                    reject(error)
                })

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        this.logger.log(`Audio extraction complete: ${audioOutputPath}`)
                        resolve()
                    } else {
                        reject(new Error(`FFmpeg exited with code ${code}`))
                    }
                })

                // Pipe the S3 stream to FFmpeg
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore - S3 response body is a readable stream
                response.Body.pipe(ffmpeg.stdin)
            })
        } catch (error) {
            this.logger.error(`Error extracting audio from S3: ${error.message}`)
            throw error
        }
    }
}
