import { Module } from '@nestjs/common'
import { VideoModule } from './video/video.module'
import { AiModule } from './ai/ai.module'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { CacheModule } from '@nestjs/cache-manager'
import { S3Module } from './s3/s3.module'
import { FfmpegModule } from './ffmpeg/ffmpeg.module'
import { ElevenlabsService } from './elevenlabs/elevenlabs.service'
import { ElevenlabsModule } from './elevenlabs/elevenlabs.module'
import * as Joi from 'joi'

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: Joi.object({
                OPENAI_API_KEY: Joi.string().required(),
                OPENAI_API_URL: Joi.string().default('https://api.openai.com/v1'),
                AWS_ACCESS_KEY_ID: Joi.string().required(),
                AWS_SECRET_ACCESS_KEY: Joi.string().required(),
                AWS_REGION: Joi.string().default('ap-southeast-1'),
                ELEVENLABS_API_KEY: Joi.string().required(),
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
        AiModule,
        S3Module,
        FfmpegModule,
        ElevenlabsModule
    ],
    controllers: [],
    providers: [ElevenlabsService]
})
export class AppModule {}
