import { Inject, Injectable, Logger } from '@nestjs/common'
import { ClientProxy } from '@nestjs/microservices'
import { firstValueFrom } from 'rxjs'
import { SERVICE_NAME, SERVICE_NAME_2 } from 'src/utils/constant'

@Injectable()
export class RabbitmqService {
    private readonly logger = new Logger(RabbitmqService.name)
    private isClient1Connected = false
    private isClient2Connected = false
    constructor(
        @Inject(SERVICE_NAME) private readonly client: ClientProxy,
        @Inject(SERVICE_NAME_2) private readonly client2: ClientProxy
    ) {}

    async onApplicationBootstrap() {
        try {
            await this.client.connect()
            this.isClient1Connected = true
            this.logger.log(`Successfully connected to RabbitMQ (queue: ${this.client['options']?.queue || 'unknown'})`)

            await this.client2.connect()
            this.isClient2Connected = true
            this.logger.log(
                `Successfully connected to RabbitMQ client2 (queue: ${this.client2['options']?.queue || 'unknown'})`
            )
        } catch (error) {
            if (!this.isClient1Connected && !this.isClient2Connected) {
                this.logger.error('Failed to connect to both RabbitMQ clients', error)
            } else if (!this.isClient1Connected) {
                this.logger.error('Failed to connect to primary RabbitMQ client', error)
            } else {
                this.logger.error('Failed to connect to secondary RabbitMQ client', error)
            }
        }
    }

    async sendMessage<T>(pattern: string, data: any): Promise<T> {
        try {
            if (!this.isClient1Connected) {
                await this.reconnect()
            }
            return await firstValueFrom(this.client.send<T>(pattern, data))
        } catch (error) {
            this.logger.error(`Error sending message to ${pattern}`, error)
            throw error
        }
    }


    emitEvent(pattern: string, data: any, useClient2: boolean = false): void {
        try {
            const selectedClient = useClient2 ? this.client2 : this.client
            const isConnected = useClient2 ? this.isClient2Connected : this.isClient1Connected

            if (!isConnected) {
                this.reconnect().catch((err) => {
                    this.logger.error(`Failed to reconnect before emitting to ${pattern}`, err)
                })
            }

            selectedClient.emit(pattern, data)
            this.logger.debug(`Event emitted to ${pattern} using ${useClient2 ? 'client2' : 'client1'}`)
        } catch (error) {
            this.logger.error(`Error emitting event to ${pattern}`, error)
            throw error
        }
    }

    public isConnected(checkClient2: boolean = false): boolean {
        return checkClient2 ? this.isClient2Connected : this.isClient1Connected
    }

    public async reconnect(reconnectClient2: boolean = false): Promise<void> {
        const selectedClient = reconnectClient2 ? this.client2 : this.client
        const clientName = reconnectClient2 ? 'client2' : 'client1'

        if (selectedClient) {
            try {
                await selectedClient.connect()

                if (reconnectClient2) {
                    this.isClient2Connected = true
                } else {
                    this.isClient1Connected = true
                }

                this.logger.log(`Successfully reconnected to RabbitMQ ${clientName}`)
            } catch (error) {
                if (reconnectClient2) {
                    this.isClient2Connected = false
                } else {
                    this.isClient1Connected = false
                }

                this.logger.error(`Failed to reconnect to RabbitMQ ${clientName}:`, error)
                throw error
            }
        } else {
            this.logger.error(`RabbitMQ ${clientName} is not initialized`)
            throw new Error(`RabbitMQ ${clientName} is not initialized`)
        }
    }
}
