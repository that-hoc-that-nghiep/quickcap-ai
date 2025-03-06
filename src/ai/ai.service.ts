import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Env } from 'src/utils/constant'
import { ChatOpenAI } from '@langchain/openai'

const AI_MODEL = 'gpt-4o'

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name)

    constructor(private readonly configSerivce: ConfigService<typeof Env, true>) {}

    getLLM = () => {
        return new ChatOpenAI({
            model: AI_MODEL,
            configuration: {
                baseURL: this.configSerivce.get('OPENAI_API_URL'),
                apiKey: this.configSerivce.get('OPENAI_API_KEY')
            }
        })
    }
}
