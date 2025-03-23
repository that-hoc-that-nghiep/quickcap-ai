import { ApiProperty } from '@nestjs/swagger'
import { Message } from './message'
import { IsArray, IsObject, IsString } from 'class-validator'

export class ChatReq {
    @ApiProperty()
    @IsString()
    question: string

    @ApiProperty({
        type: [Message]
    })
    @IsArray()
    @IsObject({ each: true })
    conversation: Message[]

    @ApiProperty()
    @IsString()
    transcript: string
}
