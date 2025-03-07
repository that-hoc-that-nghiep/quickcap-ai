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

@ApiTags('video')
@Controller('video')
export class VideoController {
    private readonly logger = new Logger(VideoController.name)
    constructor(private readonly videoService: VideoService) {}

    @Post('video-data')
    @ApiExtraModels(GenerateVideoDataRes)
    @ApiResponse({
        status: 201,
        description: 'Video metadata created successfully',
        schema: {
            $ref: getSchemaPath(GenerateVideoDataRes)
        }
    })
    async generateVideoData(@Body() generateVideoDataReq: GenerateVideoDataReq, @Res() res: Response) {
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

    @Post('chat')
    @ApiExtraModels(ChatRes)
    @ApiResponse({
        status: 201,
        description: 'Chat response created successfully',
        schema: {
            $ref: getSchemaPath(ChatRes)
        }
    })
    async chat(@Body() chatReq: ChatReq, @Res() res: Response) {
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

    @Post('check-nsfw')
    @ApiExtraModels(CheckNSFWRes)
    @ApiResponse({
        status: 200,
        description: 'Check NSFW response created successfully',
        schema: {
            $ref: getSchemaPath(CheckNSFWRes)
        }
    })
    async checkNSFW(@Body() checkNsfwReq: CheckNSFWReq, @Res() res: Response) {
        try {
            return res.status(HttpStatus.CREATED).json(await this.videoService.checkNSFW(checkNsfwReq))
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
}
