import { ApiProperty } from '@nestjs/swagger'

export class TranscribeRes {
    @ApiProperty()
    userId: string

    @ApiProperty()
    orgId: string

    @ApiProperty()
    videoUrl: string

    @ApiProperty()
    transcript: string
}
