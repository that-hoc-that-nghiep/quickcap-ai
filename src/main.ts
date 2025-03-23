import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from 'nestjs-pino'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { initializeFfmpeg } from './utils/ffmpeg.helper'
import * as tf from '@tensorflow/tfjs-node'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'

async function bootstrap() {
    initializeFfmpeg()

    const app = await NestFactory.create(AppModule)
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true
        })
    )
    const logger = app.get(Logger)
    app.useLogger(logger)
    const configService = app.get(ConfigService)

    // Connect to RabbitMQ
    const rmqUrl = configService.get('RABBITMQ_URL') || 'amqp://localhost:5672'
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
            urls: [rmqUrl],
            queue: configService.get('QUEUE_NAME'),
            queueOptions: {
                durable: true
            }
        }
    })
    logger.log(`Connecting to RabbitMQ at queue: ${configService.get('QUEUE_NAME')}`)

    const config = new DocumentBuilder()
        .setTitle('Quickcap AI')
        .setDescription('Quickcap AI API Documentation')
        .setVersion('1.0')
        .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, document)

    if (configService.get('NODE_ENV') === 'production') {
        tf.enableProdMode()
    }

    // Start hybrid application (HTTP + RabbitMQ)
    await app.startAllMicroservices()

    logger.log(`Running on port ${configService.get('PORT')}`)
    await app.listen(configService.get('PORT') || 3000)
}
bootstrap()
