import { ApiProperty } from '@nestjs/swagger'

export class ChatRes {
    @ApiProperty()
    response: string
}
