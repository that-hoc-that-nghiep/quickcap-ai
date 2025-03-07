import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'
import { ChatOpenAI } from '@langchain/openai'
import * as nsfwjs from 'nsfwjs'

const AI_MODEL = 'gpt-4o'

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name)
    private nsfwModel: nsfwjs.NSFWJS | null = null

    constructor(private readonly configSerivce: ConfigService<typeof Env, true>) {}

    getLLM() {
        return new ChatOpenAI({
            model: AI_MODEL,
            configuration: {
                baseURL: this.configSerivce.get('OPENAI_API_URL'),
                apiKey: this.configSerivce.get('OPENAI_API_KEY')
            }
        })
    }

    async getNSFWDetectModel() {
        if (!this.nsfwModel) {
            this.logger.log('Loading NSFW detection model...')
            // Load the model with TensorFlow.js
            this.nsfwModel = await nsfwjs.load()
            this.logger.log('NSFW detection model loaded successfully')
        }
        return this.nsfwModel
    }
}
