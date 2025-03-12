import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class TranscribeReq {
    @ApiProperty()
    @IsString()
    videoId: string

    @ApiProperty()
    @IsString()
    videoUrl: string
}
