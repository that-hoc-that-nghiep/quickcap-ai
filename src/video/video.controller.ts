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
import { CategorySuggestReq } from './dto/category-suggest-req'

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

    // Queue event handler for transcription
    @MessagePattern({ cmd: 'transcribe' })
    async transcribeQueue(transcribeReq: TranscribeReq) {
        try {
            this.logger.log(`Received transcribe request for videoUrl: ${transcribeReq.videoUrl}`)

            return await this.videoService.generateTranscribe(transcribeReq)
        } catch (error) {
            this.logger.error('Error queuing transcribe request:', {
                message: error.message,
                stack: error.stack,
                videoId: transcribeReq.videoUrl
            })
        }
    }

    // private async processTranscribeAndEmitResult(transcribeReq: TranscribeReq): Promise<void> {
    //     try {
    //         // Log start of processing
    //         this.logger.log(`Starting transcription for videoUrl: ${transcribeReq.videoUrl}`)

    //         // Ensure RabbitMQ connection is active before starting the process
    //         if (!this.rabbitmqService.isConnected()) {
    //             this.logger.warn(`RabbitMQ connection not active before transcription. Reconnecting...`)
    //             await this.reconnectRabbitMQ()
    //         }

    //         // Perform the actual transcription
    //         const result = await this.videoService.generateTranscribe(transcribeReq)

    //         this.logger.log(`Transcription completed for videoUrl: ${transcribeReq.videoUrl}. Emitting result.`)

    //         // Check connection again after the long-running process
    //         if (!this.rabbitmqService.isConnected()) {
    //             this.logger.warn(`RabbitMQ connection lost during transcription. Reconnecting...`)
    //             await this.reconnectRabbitMQ()
    //         }

    //         // Emit the result to transcribe-result topic/queue
    //         try {
    //             this.rabbitmqService.emitEvent('transcribe-result', result, true)
    //             this.logger.log(`Transcription result emitted for videoUrl: ${transcribeReq.videoUrl}`)
    //         } catch (emitError) {
    //             this.logger.error(`Error emitting transcription result: ${emitError.message}`)

    //             // Last attempt with reconnection
    //             await this.reconnectRabbitMQ()
    //             this.rabbitmqService.emitEvent('transcribe-result', result, true)
    //             this.logger.log(
    //                 `Transcription result emitted after reconnection for videoUrl: ${transcribeReq.videoUrl}`
    //             )
    //         }
    //     } catch (error) {
    //         this.logger.error('Error processing transcription:', {
    //             message: error.message,
    //             stack: error.stack,
    //             videoId: transcribeReq.videoUrl
    //         })

    //         // Check connection before emitting error result
    //         try {
    //             if (!this.rabbitmqService.isConnected()) {
    //                 await this.reconnectRabbitMQ()
    //             }

    //             // Emit error result to maintain communication flow
    //             this.rabbitmqService.emitEvent('transcribe-result', {
    //                 videoId: transcribeReq.videoUrl,
    //                 error: error.message,
    //                 status: 'failed'
    //             })
    //         } catch (emitError) {
    //             this.logger.error(`Failed to emit transcription error result: ${emitError.message}`)
    //         }
    //     }
    // }

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

    @MessagePattern({ cmd: 'category-suggest' })
    async categorySuggestQueue(categorySuggestReq: CategorySuggestReq) {
        try {
            return await this.videoService.categorySuggest(categorySuggestReq)
        } catch (error) {
            this.logger.error('Category suggestion queue error:', {
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
            // Log start of processing
            this.logger.log(`Starting NSFW check for videoId: ${checkNsfwReq.videoId}`)

            // Ensure RabbitMQ connection is active before starting the long process
            if (!this.rabbitmqService.isConnected()) {
                this.logger.warn(`RabbitMQ connection not active before NSFW check. Reconnecting...`)
                await this.reconnectRabbitMQ()
            }

            // Perform the actual NSFW check
            const result = await this.videoService.checkNSFW(checkNsfwReq)

            this.logger.log(`NSFW check completed for videoId: ${checkNsfwReq.videoId}. Emitting result.`)

            // Check connection again after the long-running process
            if (!this.rabbitmqService.isConnected()) {
                this.logger.warn(`RabbitMQ connection lost during NSFW check. Reconnecting...`)
                await this.reconnectRabbitMQ()
            }

            // Emit the result to nsfw-result topic/queue
            try {
                this.rabbitmqService.emitEvent('nsfw-result', result, true)
                this.logger.log(`NSFW result emitted for videoId: ${checkNsfwReq.videoId}`)
            } catch (emitError) {
                this.logger.error(`Error emitting NSFW result: ${emitError.message}`)

                // Last attempt with reconnection
                await this.reconnectRabbitMQ()
                this.rabbitmqService.emitEvent('nsfw-result', result, true)
                this.logger.log(`NSFW result emitted after reconnection for videoId: ${checkNsfwReq.videoId}`)
            }
        } catch (error) {
            this.logger.error('Error processing NSFW check:', {
                message: error.message,
                stack: error.stack,
                videoId: checkNsfwReq.videoId
            })

            // Check connection before emitting error result
            try {
                if (!this.rabbitmqService.isConnected()) {
                    await this.reconnectRabbitMQ()
                }

                // Emit error result to maintain communication flow
                this.rabbitmqService.emitEvent('nsfw-result', {
                    videoId: checkNsfwReq.videoId,
                    error: error.message,
                    status: 'failed'
                })
            } catch (emitError) {
                this.logger.error(`Failed to emit error result: ${emitError.message}`)
            }
        }
    }

    // Helper method to reconnect to RabbitMQ
    private async reconnectRabbitMQ(): Promise<void> {
        if (this.rabbitmqService.reconnect) {
            try {
                await this.rabbitmqService.reconnect()
                this.logger.log('Successfully reconnected to RabbitMQ')
            } catch (reconnectError) {
                this.logger.error(`Failed to reconnect to RabbitMQ: ${reconnectError.message}`)
                throw reconnectError
            }
        } else {
            this.logger.warn('RabbitMQ reconnect method not available')
        }
    }
}
