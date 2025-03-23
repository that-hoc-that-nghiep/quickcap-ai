import { Injectable, Logger } from '@nestjs/common'
import * as ffmpeg from 'fluent-ffmpeg'
import * as path from 'path'
import * as fs from 'fs'
import * as tf from '@tensorflow/tfjs-node'
import * as jpeg from 'jpeg-js'
import ffmpegPath from 'ffmpeg-static'

@Injectable()
export class FfmpegService {
    private readonly logger = new Logger(FfmpegService.name)

    constructor() {
        // Set the ffmpeg path to use the bundled binary
        if (ffmpegPath) {
            this.logger.log(`Using ffmpeg from: ${ffmpegPath}`)
            ffmpeg.setFfmpegPath(ffmpegPath)
        } else {
            this.logger.warn('ffmpeg-static path not found, using system ffmpeg if available')
        }

        // Initialize TensorFlow.js
        tf.ready()
            .then(() => {
                this.logger.log('TensorFlow.js initialized')
            })
            .catch((err) => {
                this.logger.error(`Failed to initialize TensorFlow.js: ${err.message}`)
            })
    }

    async extractFrames(videoPath: string, outputDir: string): Promise<string[]> {
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
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
                    reject(err)
                })
                .run()
        })
    }

    async convertImageToTensor(imagePath: string): Promise<tf.Tensor3D> {
        // Load the image using tfjs
        const imageBuffer = await fs.promises.readFile(imagePath)
        const image = jpeg.decode(imageBuffer, { useTArray: true })

        const numChannels = 3
        const numPixels = image.width * image.height
        const values = new Float32Array(numPixels * numChannels)

        for (let i = 0; i < numPixels; i++) {
            for (let c = 0; c < numChannels; ++c) {
                values[i * numChannels + c] = image.data[i * 4 + c] / 255.0
            }
        }

        return tf.tensor3d(values, [image.height, image.width, numChannels], 'float32')
    }

    async extractAudio(videoPath: string, audioOutputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.logger.log(`Extracting audio from ${videoPath} to ${audioOutputPath}`)

            ffmpeg(videoPath)
                .outputOptions([
                    '-vn', // Disable video
                    '-acodec',
                    'libmp3lame', // Audio codec
                    '-ab',
                    '128k' // Audio bitrate
                ])
                .output(audioOutputPath)
                .on('start', (commandLine) => {
                    this.logger.log(`ffmpeg started with command: ${commandLine}`)
                })
                .on('end', () => {
                    this.logger.log(`Audio extraction completed`)
                    resolve()
                })
                .on('error', (err) => {
                    this.logger.error(`Error extracting audio: ${err.message}`)
                    reject(err)
                })
                .run()
        })
    }
}
