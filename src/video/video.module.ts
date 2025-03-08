import { Module } from '@nestjs/common'
import { VideoService } from './video.service'
import { VideoController } from './video.controller'
import { AiModule } from 'src/ai/ai.module'
import { S3Module } from 'src/s3/s3.module'
import { FfmpegModule } from 'src/ffmpeg/ffmpeg.module'
import { ElevenlabsModule } from 'src/elevenlabs/elevenlabs.module'

@Module({
    imports: [AiModule, S3Module, FfmpegModule, ElevenlabsModule],
    controllers: [VideoController],
    providers: [VideoService]
})
export class VideoModule {}
