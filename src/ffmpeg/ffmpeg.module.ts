import { Module } from '@nestjs/common'
import { FfmpegService } from './ffmpeg.service'

@Module({
    exports: [FfmpegService],
    providers: [FfmpegService]
})
export class FfmpegModule {}
