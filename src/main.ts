import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { Logger } from 'nestjs-pino'
import { ConfigService } from '@nestjs/config'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    app.useGlobalPipes(new ValidationPipe())
    const logger = app.get(Logger)
    app.useLogger(logger)
    const configService = app.get(ConfigService)
    const config = new DocumentBuilder()
        .setTitle('MindGPT AI Hub')
        .setDescription('MindGPT AI Hub API description')
        .setVersion('1.0')
        .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, document)
    logger.log(`Running on port ${configService.get('PORT')}`)
    await app.listen(configService.get('PORT') || 3000)
}
bootstrap()
