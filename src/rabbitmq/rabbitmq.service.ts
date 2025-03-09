import { Inject, Injectable, Logger } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import { SERVICE_NAME } from 'src/utils/constant'

@Injectable()
export class RabbitmqService {
    private readonly logger = new Logger(RabbitmqService.name)
    private isClientConnected = false

    constructor(@Inject(SERVICE_NAME) private readonly client: ClientProxy) {}

    async onApplicationBootstrap() {
        try {
            await this.client.connect()
            this.isClientConnected = true
            this.logger.log(`Successfully connected to RabbitMQ (queue: ${this.client['options']?.queue || 'unknown'})`)
        } catch (error) {
            this.isClientConnected = false
            this.logger.error('Failed to connect to RabbitMQ', error)
        }
    }

    async sendMessage<T>(pattern: string, data: any): Promise<T> {
        try {
            if (!this.isClientConnected) {
                await this.reconnect()
            }
            return await firstValueFrom(this.client.send<T>(pattern, data))
        } catch (error) {
            this.logger.error(`Error sending message to ${pattern}`, error)
            throw error
        }
    }

    emitEvent(pattern: string, data: any): void {
        try {
            if (!this.isClientConnected) {
                // No await here because emit methods are void
                this.reconnect().catch((err) => {
                    this.logger.error(`Failed to reconnect before emitting to ${pattern}`, err)
                })
            }
            this.client.emit(pattern, data)
            this.logger.debug(`Event emitted to ${pattern}`)
        } catch (error) {
            this.logger.error(`Error emitting event to ${pattern}`, error)
            throw error
        }
    }

    // Check if the connection to RabbitMQ is active
    public isConnected(): boolean {
        return this.isClientConnected
    }

    // Reconnect to RabbitMQ if the connection is lost
    public async reconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.connect()
                this.isClientConnected = true
                this.logger.log('Successfully reconnected to RabbitMQ')
            } catch (error) {
                this.isClientConnected = false
                this.logger.error('Failed to reconnect to RabbitMQ:', error)
                throw error
            }
        } else {
            this.logger.error('RabbitMQ client is not initialized')
            throw new Error('RabbitMQ client is not initialized')
        }
    }
}
