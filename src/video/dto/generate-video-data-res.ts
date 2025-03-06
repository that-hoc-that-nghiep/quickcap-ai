import { ApiProperty } from '@nestjs/swagger'

export class GenerateVideoDataRes {
    @ApiProperty()
    title: string

    @ApiProperty()
    description: string

    @ApiProperty()
    category: string

    @ApiProperty()
    isNewCategory: boolean
}
