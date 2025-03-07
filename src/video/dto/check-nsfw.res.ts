import { ApiProperty } from '@nestjs/swagger'

export enum VideoCategory {
    DRAWING = 'Drawing',
    HENTAI = 'Hentai',
    NEUTRAL = 'Neutral',
    PORN = 'Porn',
    SEXY = 'Sexy'
}

export class CheckNSFWRes {
    @ApiProperty({
        enum: VideoCategory,
        enumName: 'VideoCategory',
        description: 'The dominant category of the video, values are: Drawing, Hentai, Neutral, Porn, Sexy'
    })
    dominantCategory: VideoCategory

    @ApiProperty()
    categoryBreakdown: {
        Drawing: number
        Hentai: number
        Neutral: number
        Porn: number
        Sexy: number
    }
    isNSFW: boolean
}
