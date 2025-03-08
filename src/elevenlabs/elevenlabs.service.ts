import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ElevenLabsClient } from 'elevenlabs'
import * as fs from 'fs'
import { Env } from 'src/utils/constant'

@Injectable()
export class ElevenlabsService {
    private readonly logger = new Logger(ElevenlabsService.name)
    private elevenlabsClient: ElevenLabsClient

    constructor(private readonly configService: ConfigService<typeof Env, true>) {
        this.elevenlabsClient = new ElevenLabsClient({
            apiKey: this.configService.get('ELEVENLABS_API_KEY')
        })
    }

    async generateTranscript(soundPath: string) {
        try {
            this.logger.log(`Generating transcript for audio file at: ${soundPath}`)

            // Read the audio file
            const audioBuffer = await fs.promises.readFile(soundPath)

            // Convert to Blob
            const audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' })

            // Call ElevenLabs API for speech-to-text conversion
            const transcription = await this.elevenlabsClient.speechToText.convert({
                file: audioBlob,
                model_id: 'scribe_v1', // Current supported models: "scribe_v1" and "scribe_v1_base"
                tag_audio_events: true, // Tag events like laughter, applause, etc.
                diarize: true // Annotate who is speaking
            })

            this.logger.log('Transcription generated successfully')

            return {
                text: transcription.text
            }
        } catch (error) {
            this.logger.error(`Error generating transcript: ${error.message}`)
            throw new Error(`Failed to generate transcript: ${error.message}`)
        }
    }
}
