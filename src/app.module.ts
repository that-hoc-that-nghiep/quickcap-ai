import { Module } from '@nestjs/common'
import { VideoModule } from './video/video.module'
import { AiModule } from './ai/ai.module'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { CacheModule } from '@nestjs/cache-manager'
import * as Joi from 'joi'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: Joi.object({
                OPENAI_API_KEY: Joi.string().required(),
                OPENAI_API_URL: Joi.string().default('https://api.openai.com/v1'),
                PORT: Joi.number().default(3000)
            })
        }),
        LoggerModule.forRoot({
            pinoHttp: {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        singleLine: true
                    }
                }
            }
        }),
        CacheModule.register({
            isGlobal: true
        }),
        VideoModule,
        AiModule
    ],
    controllers: [],
    providers: []
})
export class AppModule {}
