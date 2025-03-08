import { Inject, Injectable, Logger } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import { SERVICE_NAME } from 'src/utils/constant'

@Injectable()
export class RabbitmqService {
    private readonly logger = new Logger(RabbitmqService.name)

    constructor(@Inject(SERVICE_NAME) private readonly client: ClientProxy) {}

    async onApplicationBootstrap() {
        try {
            await this.client.connect()
            this.logger.log('Successfully connected to RabbitMQ')
        } catch (error) {
            this.logger.error('Failed to connect to RabbitMQ', error)
        }
    }

    async sendMessage<T>(pattern: string, data: any): Promise<T> {
        try {
            return await firstValueFrom(this.client.send<T>(pattern, data))
        } catch (error) {
            this.logger.error(`Error sending message to ${pattern}`, error)
            throw error
        }
    }

    emitEvent(pattern: string, data: any): void {
        try {
            this.client.emit(pattern, data)
            this.logger.debug(`Event emitted to ${pattern}`)
        } catch (error) {
            this.logger.error(`Error emitting event to ${pattern}`, error)
            throw error
        }
    }
}
