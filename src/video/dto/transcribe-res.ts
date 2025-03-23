import { ApiProperty } from '@nestjs/swagger'

export class TranscribeRes {
    @ApiProperty()
    transcript: string
}
