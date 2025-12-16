import { Test, TestingModule } from '@nestjs/testing';
import { LlmController } from './llm.controller';
import { LlmService } from './llm.service';
import { ResponseType } from './dto/llmGenerateResponse.dto';

// Mock uuid module
jest.mock('../common/uuid', () => ({
    createUUID: jest.fn(() => 'mock-uuid'),
}));

describe('LlmController', () => {
    let controller: LlmController;
    let mockLlmService: Partial<LlmService>;

    beforeEach(async () => {
        mockLlmService = {
            generate: jest.fn().mockResolvedValue({
                type: ResponseType.ANSWER,
                answer: 'Test answer',
                message: {
                    messageId: 'msg-123',
                    conversationId: 'conv-123',
                    userRole: 'ASSISTANT',
                    content: 'Test answer',
                    createdAt: new Date(),
                },
                sources: {
                    fileSearch: [{
                        fileName: 'test.txt',
                        chunks: [{
                            text: 'test content',
                            confidence: 0.9,
                        }],
                    }],
                },
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [LlmController],
            providers: [
                {
                    provide: LlmService,
                    useValue: mockLlmService,
                },
            ],
        }).compile();

        controller = module.get<LlmController>(LlmController);
    });

    describe('generate', () => {
        it('Web検索なしのリクエストを処理できること', async () => {
            const payload = {
                question: 'What is TypeScript?',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: false,
            };

            const result = await controller.generate(payload);

            expect(mockLlmService.generate).toHaveBeenCalledWith({
                prompt: 'What is TypeScript?',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: false,
            });

            expect(result).toEqual({
                type: ResponseType.ANSWER,
                answer: 'Test answer',
                sources: expect.objectContaining({
                    fileSearch: expect.any(Array),
                }),
            });
        });

        it('Web検索ありのリクエストを処理できること', async () => {
            mockLlmService.generate = jest.fn().mockResolvedValue({
                type: ResponseType.ANSWER,
                answer: 'Enhanced answer with web search',
                message: {
                    messageId: 'msg-456',
                    conversationId: 'conv-123',
                    userRole: 'ASSISTANT',
                    content: 'Enhanced answer with web search',
                    createdAt: new Date(),
                },
                sources: {
                    fileSearch: [{
                        fileName: 'test.txt',
                        chunks: [{
                            text: 'test content',
                            confidence: 0.9,
                        }],
                    }],
                    webSearch: [{
                        title: 'Web Result',
                        url: 'https://example.com',
                        snippet: 'Web search snippet',
                    }],
                },
            });

            const payload = {
                question: 'What are the latest AI trends?',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: true,
            };

            const result = await controller.generate(payload);

            expect(mockLlmService.generate).toHaveBeenCalledWith({
                prompt: 'What are the latest AI trends?',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: true,
            });

            expect(result).toEqual({
                type: ResponseType.ANSWER,
                answer: 'Enhanced answer with web search',
                sources: expect.objectContaining({
                    fileSearch: expect.any(Array),
                    webSearch: expect.any(Array),
                }),
            });
        });

        it('requireWebSearchのデフォルト値を処理できること', async () => {
            const payload = {
                question: 'Hello',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                // requireWebSearch not provided, should default to false
            };

            const result = await controller.generate(payload);

            expect(mockLlmService.generate).toHaveBeenCalledWith({
                prompt: 'Hello',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: false, // default value
            });

            expect(result.type).toBe(ResponseType.ANSWER);
        });

        it('レスポンスに削除されたフィールドが含まれないこと', async () => {
            const payload = {
                question: 'Test question',
                conversationId: '123e4567-e89b-12d3-a456-426614174000',
                requireWebSearch: false,
            };

            const result = await controller.generate(payload);

            // 削除されたフィールドが含まれていないことを確認
            expect(result).not.toHaveProperty('needsWebSearch');
            expect(result).not.toHaveProperty('webSearchReason');
            expect(result).not.toHaveProperty('confirmationLabels');
        });
    });

    describe('documentUpload', () => {
        it('ドキュメントアップロードリクエストを処理できること', async () => {
            mockLlmService.uploadDocument = jest.fn().mockResolvedValue(undefined);

            const payload = {
                filePath: '/path/to/document.pdf',
                displayName: 'Important Document',
                mimeType: 'application/pdf',
            };

            const result = await controller.documentUpload(payload);

            expect(mockLlmService.uploadDocument).toHaveBeenCalledWith({
                filePath: '/path/to/document.pdf',
                displayName: 'Important Document',
                mimeType: 'application/pdf',
            });

            expect(result).toEqual({ uploaded: true });
        });
    });
});