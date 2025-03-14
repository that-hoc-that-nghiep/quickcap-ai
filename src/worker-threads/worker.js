const { parentPort } = require('worker_threads')
const fs = require('fs')
const path = require('path')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { Readable } = require('stream')
let ffmpeg
let ffmpegStatic
let tf
let jpeg
let nsfwjs

// Dynamically import modules to prevent errors if they're not installed
async function initModules() {
    try {
        ffmpegStatic = require('ffmpeg-static')
        ffmpeg = require('fluent-ffmpeg')
        tf = require('@tensorflow/tfjs') // Changed from @tensorflow/tfjs-node to @tensorflow/tfjs
        jpeg = require('jpeg-js')
        nsfwjs = require('nsfwjs')

        // Set up ffmpeg path
        if (ffmpegStatic) {
            ffmpeg.setFfmpegPath(ffmpegStatic)
        }

        // Initialize TensorFlow.js
        await tf.ready()
        console.log('TensorFlow.js initialized in pure JS mode')

        console.log('Modules initialized successfully')
    } catch (error) {
        console.error(`Error initializing modules: ${error.message}`)
        parentPort.postMessage({ error: `Failed to initialize modules: ${error.message}` })
    }
}

// Initialize modules
initModules()

// Worker state
let nsfwModel = null
let s3Client = null

// Handle messages from the main thread
parentPort.on('message', async (task) => {
    try {
        if (task.type === 'transcribe') {
            // Extract audio from video for transcription
            await extractAudio(task.data.videoPath, task.data.audioPath)
            parentPort.postMessage({ data: { audioPath: task.data.audioPath } })
        } else if (task.type === 'nsfw') {
            // Process frames for NSFW detection
            const predictions = await processFramesForNSFW(task.data.frameFiles)
            parentPort.postMessage({ data: { predictions } })
        } else if (task.type === 'download') {
            // Download file from S3
            await downloadFromS3(
                task.data.videoUrl,
                task.data.outputPath,
                task.data.region,
                task.data.accessKeyId,
                task.data.secretAccessKey
            )
            parentPort.postMessage({ data: { filePath: task.data.outputPath } })
        } else if (task.type === 'extractFrames') {
            // Extract frames from video
            const frameFiles = await extractFrames(task.data.videoPath, task.data.outputDir)
            parentPort.postMessage({ data: { frameFiles } })
        }
    } catch (error) {
        console.error(`Error in worker: ${error.message}`)
        parentPort.postMessage({ error: error.message })
    }
})

/**
 * Extracts audio from video
 */
async function extractAudio(videoPath, audioOutputPath) {
    if (!ffmpeg) {
        throw new Error('ffmpeg module not initialized')
    }

    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .outputOptions([
                '-vn', // Disable video
                '-acodec',
                'libmp3lame', // Audio codec
                '-ab',
                '128k' // Audio bitrate
            ])
            .output(audioOutputPath)
            .on('end', () => {
                console.log(`Audio extraction completed: ${audioOutputPath}`)
                resolve()
            })
            .on('error', (err) => {
                console.error(`Error extracting audio: ${err.message}`)
                reject(err)
            })
            .run()
    })
}

/**
 * Processes frames for NSFW detection
 */
async function processFramesForNSFW(frameFiles) {
    if (!nsfwjs || !tf) {
        throw new Error('NSFW or TensorFlow modules not initialized')
    }

    // Load NSFW model if not already loaded
    if (!nsfwModel) {
        console.log('Loading NSFW model...')
        nsfwModel = await nsfwjs.load("InceptionV3")
        console.log('NSFW model loaded successfully')
    }

    const predictions = []

    // Process frames sequentially to avoid out of memory errors
    for (const framePath of frameFiles) {
        try {
            // Load and process image
            const imageTensor = await convertImageToTensor(framePath)
            const prediction = await nsfwModel.classify(imageTensor)

            // Clean up tensor
            imageTensor.dispose()

            predictions.push(prediction)

            // Delete the frame file to free up disk space
            try {
                fs.unlinkSync(framePath)
            } catch (err) {
                // Non-critical error, continue
                console.warn(`Could not delete frame ${framePath}: ${err.message}`)
            }
        } catch (error) {
            // Continue with next frame if one fails
            console.error(`Error processing frame ${framePath}: ${error.message}`)
        }

        // Small delay to let the event loop breathe
        await new Promise((resolve) => setTimeout(resolve, 50))
    }

    console.log(`Processed ${predictions.length} frames successfully`)
    return predictions
}

/**
 * Downloads file from S3
 */
async function downloadFromS3(videoUrl, outputPath, region, accessKeyId, secretAccessKey) {
    // Initialize S3 client if not already created
    if (!s3Client) {
        s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey
            }
        })
    }

    try {
        console.log(`Downloading from ${videoUrl} to ${outputPath}`)

        // Parse the S3 URL to extract bucket and key
        const videoUrlObj = new URL(videoUrl)
        const bucketName = videoUrlObj.hostname.split('.')[0]
        const objectKey = videoUrlObj.pathname.substring(1) // Remove leading slash

        // Get the object from S3
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey
        })

        const response = await s3Client.send(command)

        // Create a write stream to save the video locally
        const writeStream = fs.createWriteStream(outputPath)

        // Save the video stream to a file
        if (response.Body instanceof Readable) {
            return new Promise((resolve, reject) => {
                response.Body.pipe(writeStream)
                    .on('finish', () => {
                        console.log(`Download completed to ${outputPath}`)
                        resolve()
                    })
                    .on('error', (err) => {
                        console.error(`Download stream error: ${err.message}`)
                        reject(err)
                    })
            })
        } else {
            throw new Error('Empty or invalid response body from S3')
        }
    } catch (error) {
        console.error(`Error downloading from S3: ${error.message}`)
        throw error
    }
}

/**
 * Extracts frames from a video file
 */
async function extractFrames(videoPath, outputDir) {
    if (!ffmpeg) {
        throw new Error('ffmpeg module not initialized')
    }

    return new Promise((resolve, reject) => {
        console.log(`Starting frame extraction from ${videoPath} to ${outputDir}`)

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
                console.log(`ffmpeg started with command: ${commandLine}`)
            })
            .on('end', async () => {
                try {
                    console.log(`Frame extraction completed`)
                    const files = fs.readdirSync(outputDir)
                    const frameFiles = files
                        .filter((file) => file.startsWith('frame-') && file.endsWith('.jpg'))
                        .map((file) => path.join(outputDir, file))
                        .sort() // Sort to ensure frames are processed in order

                    console.log(`Found ${frameFiles.length} extracted frames`)
                    resolve(frameFiles)
                } catch (err) {
                    console.error(`Error reading frames directory: ${err.message}`)
                    reject(err)
                }
            })
            .on('error', (err) => {
                console.error(`Error extracting frames: ${err.message}`)
                reject(err)
            })
            .run()
    })
}

/**
 * Converts image file to tensor
 */
async function convertImageToTensor(imagePath) {
    if (!tf || !jpeg) {
        throw new Error('TensorFlow or JPEG modules not initialized')
    }

    try {
        const imageBuffer = fs.readFileSync(imagePath)
        const image = jpeg.decode(imageBuffer, { useTArray: true })

        // Create a tensor from the decoded image data
        const numChannels = 3
        const numPixels = image.width * image.height
        const values = new Float32Array(numPixels * numChannels) // Changed to Float32Array for better compatibility

        for (let i = 0; i < numPixels; i++) {
            for (let c = 0; c < numChannels; ++c) {
                values[i * numChannels + c] = image.data[i * 4 + c] / 255.0 // Normalize to [0,1] range
            }
        }

        return tf.tensor3d(values, [image.height, image.width, numChannels], 'float32')
    } catch (error) {
        console.error(`Error converting image to tensor: ${error.message}`)
        throw error
    }
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
    parentPort.postMessage({ error: `Uncaught exception: ${err.message}` })
})

console.log('Worker initialized and ready')
