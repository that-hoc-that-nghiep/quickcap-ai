import { Module } from '@nestjs/common'
import { VideoModule } from './video/video.module'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { CacheModule } from '@nestjs/cache-manager'
import * as Joi from 'joi'
import { WorkerThreadsModule } from './worker-threads/worker-threads.module'
import { ServeStaticModule } from '@nestjs/serve-static'
import { join } from 'path'

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
                RABBITMQ_URL: Joi.string().required(),
                QUEUE_NAME: Joi.string().default('quickcap'),
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
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            serveRoot: '/',
        }),
        VideoModule,
        WorkerThreadsModule
    ],
    controllers: [],
    providers: []
})
export class AppModule {}
