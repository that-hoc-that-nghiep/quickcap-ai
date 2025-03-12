import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class TranscribeReq {
    @ApiProperty()
    @IsString()
    userId: string

    @ApiProperty()
    @IsString()
    orgId: string

    @ApiProperty()
    @IsString()
    videoUrl: string
}
 