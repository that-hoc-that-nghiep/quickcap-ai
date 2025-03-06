import { Controller, Post, Body, Res, HttpStatus, Logger } from '@nestjs/common'
import { VideoService } from './video.service'
import { GenerateVideoDataReq } from './dto/generate-video-data-req'
import { ApiResponse, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'

@ApiTags('video')
@Controller('video')
export class VideoController {
    private readonly logger = new Logger(VideoController.name)
    constructor(private readonly videoService: VideoService) {}

    @Post('video-data')
    @ApiResponse({ status: 201, description: 'Video metadata created successfully' })
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
}
