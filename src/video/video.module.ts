import { Module } from '@nestjs/common'
import { VideoService } from './video.service'
import { VideoController } from './video.controller'
import { AiModule } from 'src/ai/ai.module'

@Module({
    imports: [AiModule],
    controllers: [VideoController],
    providers: [VideoService]
})
export class VideoModule {}
