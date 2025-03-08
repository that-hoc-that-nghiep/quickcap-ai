import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class CheckNSFWReq {
    @ApiProperty()
    @IsString()
    videoUrl: string

    @ApiProperty()
    @IsString()
    videoId: string
}
