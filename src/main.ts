import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from 'nestjs-pino'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { initializeFfmpeg } from './utils/ffmpeg.helper'
import * as tf from '@tensorflow/tfjs'

async function bootstrap() {
    // Initialize ffmpeg before starting the application
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
    logger.log(`Running on port ${configService.get('PORT')}`)
    await app.listen(configService.get('PORT') || 3000)
}
bootstrap()
