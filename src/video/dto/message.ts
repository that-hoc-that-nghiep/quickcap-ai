import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsString } from 'class-validator'

export enum Role {
    USER = 'user',
    BOT = 'bot'
}

export class Message {
    @ApiProperty({
        enum: Role,
        enumName: 'Role',
        description: 'The role of the message sender, values: user, bot'
    })
    @IsEnum(Role)
    role: Role

    @ApiProperty()
    @IsString()
    text: string
}
