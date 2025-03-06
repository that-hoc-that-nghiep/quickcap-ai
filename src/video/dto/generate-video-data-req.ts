import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsString } from 'class-validator'

export class GenerateVideoDataReq {
    @ApiProperty()
    @IsString()
    transcript: string

    @ApiProperty()
    @IsString({ each: true })
    @IsArray()
    categories: string[]
}
