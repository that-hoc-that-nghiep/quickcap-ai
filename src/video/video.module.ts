import { Module } from '@nestjs/common'
import { VideoService } from './video.service'
import { VideoController } from './video.controller'
import { AiModule } from 'src/ai/ai.module'
import { S3Module } from 'src/s3/s3.module'
import { FfmpegModule } from 'src/ffmpeg/ffmpeg.module'
import { RabbitmqModule } from 'src/rabbitmq/rabbitmq.module'
import { WorkerThreadsModule } from '../worker-threads/worker-threads.module'

@Module({
    imports: [AiModule, S3Module, FfmpegModule, RabbitmqModule, WorkerThreadsModule],
    controllers: [VideoController],
    providers: [VideoService]
})
export class VideoModule {}
