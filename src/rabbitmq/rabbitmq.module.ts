import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { RabbitmqService } from './rabbitmq.service'
import { SERVICE_NAME, SERVICE_NAME_2 } from 'src/utils/constant'

@Module({
    imports: [
        ClientsModule.registerAsync([
            {
                name: SERVICE_NAME,
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
                        queue: configService.get<string>('QUEUE_NAME'),
                        queueOptions: {
                            durable: true
                        }
                    }
                }),
                inject: [ConfigService]
            },
            {
                name: SERVICE_NAME_2,
                imports: [ConfigModule],
                useFactory: (configService: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
                        queue: configService.get<string>('QUEUE_NAME_2'),
                        queueOptions: {
                            durable: true
                        }
                    }
                }),
                inject: [ConfigService]
            }
        ])
    ],
    providers: [RabbitmqService],
    exports: [RabbitmqService]
})
export class RabbitmqModule {}
