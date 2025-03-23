import { ApiProperty } from '@nestjs/swagger'

export class CategorySuggestRes {
    @ApiProperty()
    category: string

    @ApiProperty()
    isNewCategory: boolean
}
