import { Module } from '@nestjs/common'
import { ElevenlabsService } from './elevenlabs.service'

@Module({
    exports: [ElevenlabsService],
    providers: [ElevenlabsService]
})
export class ElevenlabsModule {}
