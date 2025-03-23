import * as ffmpeg from 'fluent-ffmpeg'
import * as ffmpegStatic from 'ffmpeg-static'
import { Logger } from '@nestjs/common'

const logger = new Logger('FFmpegHelper')

export function initializeFfmpeg(): void {
    if (ffmpegStatic) {
        logger.log(`Setting ffmpeg path to: ${ffmpegStatic.default}`)
        ffmpeg.setFfmpegPath(ffmpegStatic as any)
    } else {
        logger.warn('ffmpeg-static path not found, using system ffmpeg if available')
    }
}
