import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class GenerateVideoDataReq {
    @ApiProperty()
    @IsString()
    transcript: string
}
