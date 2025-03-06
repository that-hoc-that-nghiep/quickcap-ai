import { Injectable, Logger } from '@nestjs/common'
import { GenerateVideoDataReq } from './dto/generate-video-data-req'
// import { GenerateVideoDataRes } from './dto/generate-video-data-res'
import { AiService } from 'src/ai/ai.service'
import { StructuredOutputParser } from 'langchain/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'

@Injectable()
export class VideoService {
    private readonly logger = new Logger(VideoService.name)

    constructor(private readonly aiService: AiService) {}

    async generateVideoData(generateVideoDataReq: GenerateVideoDataReq) {
        const { transcript, categories } = generateVideoDataReq

        const videoDataResSchema = z
            .object({
                title: z
                    .optional(z.string())
                    .describe('A catchy and descriptive title for the video, maximum 100 characters'),
                description: z
                    .optional(z.string())
                    .describe('A detailed description of the video content that highlights key points, 2-3 paragraphs'),
                category: z
                    .optional(z.string())
                    .describe(
                        'The most suitable category for the video. If none of the provided categories match the content, suggest a new appropriate category name'
                    ),
                isNewCategory: z
                    .optional(z.boolean())
                    .describe(
                        'Set to true ONLY if creating a new category because none of the provided categories match the content. Set to false if selecting from the provided categories list'
                    )
            })
            .describe('The response from the AI model for generating video data')

        const parser = StructuredOutputParser.fromZodSchema(videoDataResSchema)

        const prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                `
                You are an AI assistant that helps content creators optimize their videos.
                
                Based on user's video transcript and current categories list, analyze the content and provide metadata.
                
                For the category selection:
                1. First evaluate if the transcript content matches ANY of the provided categories
                2. If there is a reasonable match with an existing category, use that category and set isNewCategory to false
                3. If NONE of the provided categories match the content, suggest a new appropriate category name and set isNewCategory to true
                4. Do not force the content into an existing category if it doesn't reasonably belong there
                
                Example: If transcript is about programming but categories only include "Math" and "History", you should suggest "Programming" or "Coding" as a new category with isNewCategory=true.

                Wrap the output in \`json\` tags\n{format_instructions}`
            ],
            ['user', '{transcript}'],
            ['user', 'Available categories: {categories}']
        ])

        const partialedPrompt = await prompt.partial({
            format_instructions: parser.getFormatInstructions()
        })

        const llm = this.aiService.getLLM()

        const chain = partialedPrompt.pipe(llm).pipe(parser)

        const res = await chain.invoke({
            transcript,
            categories
        })

        this.logger.log(`Generated video data: ${JSON.stringify(res)}`)

        return res
    }
}
