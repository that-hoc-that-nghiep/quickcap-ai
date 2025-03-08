import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'

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
}
