import { Controller, Post, Body, Res, HttpStatus, Logger } from '@nestjs/common'
import { VideoService } from './video.service'
import { GenerateVideoDataReq } from './dto/generate-video-data-req'
import { GenerateVideoDataRes } from './dto/generate-video-data-res'
import { ApiExtraModels, ApiResponse, ApiTags, getSchemaPath } from '@nestjs/swagger'
import { Response } from 'express'
import { ChatReq } from './dto/chat-req'
import { ChatRes } from './dto/chat-res'
import { CheckNSFWReq } from './dto/check-nsfw-req'
import { CheckNSFWRes } from './dto/check-nsfw.res'
import { TranscribeRes } from './dto/transcribe-res'
import { TranscribeReq } from './dto/transcribe-req'
import { EventPattern, MessagePattern } from '@nestjs/microservices'
import { RabbitmqService } from 'src/rabbitmq/rabbitmq.service'

@ApiTags('video')
@Controller('video')
export class VideoController {
    private readonly logger = new Logger(VideoController.name)
    constructor(
        private readonly videoService: VideoService,
        public readonly rabbitmqService: RabbitmqService
    ) {}

    // HTTP API endpoint for transcription
    @Post('transcribe')
    @ApiExtraModels(TranscribeRes)
    @ApiResponse({
        status: 201,
        description: 'Transcription created successfully',
        schema: {
            $ref: getSchemaPath(TranscribeRes)
        }
    })
    async transcribeHttp(@Body() transcribeReq: TranscribeReq, @Res() res: Response) {
        try {
            return res.status(HttpStatus.CREATED).json(await this.videoService.generateTranscribe(transcribeReq))
        } catch (error) {
            this.logger.error('Transcribe error:', {
                message: error.message,
                stack: error.stack,
                details: error.response
            })

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Internal server error',
                details: error.message
            })
        }
    }

    // Queue message handler for transcription
    @MessagePattern({ cmd: 'transcribe' })
    async transcribeQueue(transcribeReq: TranscribeReq) {
        try {
            return await this.videoService.generateTranscribe(transcribeReq)
        } catch (error) {
            this.logger.error('Transcribe queue error:', {
                message: error.message,
                stack: error.stack,
                details: error.response
            })
            throw error
        }
    }

    // HTTP API endpoint for video data generation
    @Post('video-data')
    @ApiExtraModels(GenerateVideoDataRes)
    @ApiResponse({
        status: 201,
        description: 'Video metadata created successfully',
        schema: {
            $ref: getSchemaPath(GenerateVideoDataRes)
        }
    })
    async generateVideoDataHttp(@Body() generateVideoDataReq: GenerateVideoDataReq, @Res() res: Response) {
        try {
            return res.status(HttpStatus.CREATED).json(await this.videoService.generateVideoData(generateVideoDataReq))
        } catch (error) {
            this.logger.error('Create video metadata error:', {
                message: error.message,
                stack: error.stack,
                details: error.response
            })

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Internal server error',
                details: error.message
            })
        }
    }

    // Queue message handler for video data generation
    @MessagePattern({ cmd: 'video-data' })
    async generateVideoDataQueue(generateVideoDataReq: GenerateVideoDataReq) {
        try {
            return await this.videoService.generateVideoData(generateVideoDataReq)
        } catch (error) {
            this.logger.error('Create video metadata queue error:', {
                message: error.message,
                stack: error.stack
            })
            throw error
        }
    }

    // HTTP API endpoint for chat
    @Post('chat')
    @ApiExtraModels(ChatRes)
    @ApiResponse({
        status: 201,
        description: 'Chat response created successfully',
        schema: {
            $ref: getSchemaPath(ChatRes)
        }
    })
    async chatHttp(@Body() chatReq: ChatReq, @Res() res: Response) {
        try {
            return res.status(HttpStatus.CREATED).json(await this.videoService.chat(chatReq))
        } catch (error) {
            this.logger.error('Chat error:', {
                message: error.message,
                stack: error.stack,
                details: error.response
            })

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Internal server error',
                details: error.message
            })
        }
    }

    // Queue message handler for chat
    @MessagePattern({ cmd: 'chat' })
    async chatQueue(chatReq: ChatReq) {
        try {
            return await this.videoService.chat(chatReq)
        } catch (error) {
            this.logger.error('Chat queue error:', {
                message: error.message,
                stack: error.stack
            })
            throw error
        }
    }

    // HTTP API endpoint for NSFW check
    @Post('check-nsfw')
    @ApiExtraModels(CheckNSFWRes)
    @ApiResponse({
        status: 200,
        description: 'Check NSFW response created successfully',
        schema: {
            $ref: getSchemaPath(CheckNSFWRes)
        }
    })
    async checkNSFWHttp(@Body() checkNsfwReq: CheckNSFWReq, @Res() res: Response) {
        try {
            return res.status(HttpStatus.OK).json(await this.videoService.checkNSFW(checkNsfwReq))
        } catch (error) {
            this.logger.error('Check NSFW error:', {
                message: error.message,
                stack: error.stack,
                details: error.response
            })

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                message: 'Internal server error',
                details: error.message
            })
        }
    }

    // Queue event handler for NSFW check
    @EventPattern('check-nsfw')
    checkNSFWQueue(checkNsfwReq: CheckNSFWReq) {
        try {
            this.logger.log(`Received NSFW check request for videoId: ${checkNsfwReq.videoId}`)

            // Process asynchronously - don't await
            this.processNSFWCheckAndEmitResult(checkNsfwReq)

            // Return immediately as this is fire-and-forget
            this.logger.log(`NSFW check queued for processing: ${checkNsfwReq.videoId}`)
        } catch (error) {
            this.logger.error('Error queuing NSFW check:', {
                message: error.message,
                stack: error.stack,
                videoId: checkNsfwReq.videoId
            })
        }
    }

    private async processNSFWCheckAndEmitResult(checkNsfwReq: CheckNSFWReq): Promise<void> {
        try {
            // Perform the actual NSFW check
            const result = await this.videoService.checkNSFW(checkNsfwReq)

            this.logger.log(`NSFW check completed for videoId: ${checkNsfwReq.videoId}. Emitting result.`)

            // Emit the result to nsfw-result topic/queue
            this.rabbitmqService.emitEvent('nsfw-result', result)

            this.logger.log(`NSFW result emitted for videoId: ${checkNsfwReq.videoId}`)
        } catch (error) {
            this.logger.error('Error processing NSFW check:', {
                message: error.message,
                stack: error.stack,
                videoId: checkNsfwReq.videoId
            })

            // Emit error result to maintain communication flow
            this.rabbitmqService.emitEvent('nsfw-result', {
                videoId: checkNsfwReq.videoId,
                error: error.message,
                status: 'failed'
            })
        }
    }
}
