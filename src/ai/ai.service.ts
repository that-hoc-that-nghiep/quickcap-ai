import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'
import { ChatOpenAI } from '@langchain/openai'
import * as nsfwjs from 'nsfwjs'
import * as tf from '@tensorflow/tfjs' // Changed from @tensorflow/tfjs-node to @tensorflow/tfjs

const AI_MODEL = 'gpt-4o'

@Injectable()
export class AiService implements OnModuleInit {
    private readonly logger = new Logger(AiService.name)
    private nsfwModel: nsfwjs.NSFWJS | null = null

    constructor(private readonly configSerivce: ConfigService<typeof Env, true>) {}

    async onModuleInit() {
        // Initialize TensorFlow.js
        try {
            await tf.ready()
            this.logger.log('TensorFlow.js initialized in AI service')
        } catch (err) {
            this.logger.error(`Failed to initialize TensorFlow.js: ${err.message}`)
        }
    }

    getLLM() {
        return new ChatOpenAI({
            model: AI_MODEL,
            configuration: {
                baseURL: this.configSerivce.get('OPENAI_API_URL'),
                apiKey: this.configSerivce.get('OPENAI_API_KEY')
            }
        })
    }

    getWhisperLoader(audioPath: string): OpenAIWhisperAudio {
        try {
            return new OpenAIWhisperAudio(audioPath, {
                clientOptions: {
                    apiKey: this.configSerivce.get('OPENAI_API_KEY'),
                    baseURL: this.configSerivce.get('OPENAI_API_URL')
                }
            })
        } catch (error) {
            this.logger.error(`Failed to create Whisper loader: ${error.message}`)
            throw new Error(`Failed to initialize Whisper loader: ${error.message}`)
        }
    }

    async getNSFWDetectModel() {
        if (!this.nsfwModel) {
            this.logger.log('Loading NSFW detection model...')
            try {
                // Make sure TensorFlow is ready
                await tf.ready()
                // Load the model with TensorFlow.js
                this.nsfwModel = await nsfwjs.load()
                this.logger.log('NSFW detection model loaded successfully')
            } catch (error) {
                this.logger.error(`Failed to load NSFW model: ${error.message}`)
                throw new Error(`Failed to initialize NSFW model: ${error.message}`)
            }
        }
        return this.nsfwModel
    }
}
