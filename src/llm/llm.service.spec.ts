import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { MessagePort, MESSAGE_PORT } from '../message/message.port';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import { UserPort, USER_PORT } from '../user/user.port';
import { ConversationPort, CONVERSATION_PORT } from '../conversation/conversation.port';
import { PersonalityPresetService } from '../personality-preset/personalityPreset.service';
import { PersonalityPreset, toPersonalityPresetId } from '../personality-preset/personalityPreset.types';
import { InMemoryCacheService } from './cache/inMemoryCacheService';
import { GeminiCacheService } from './cache/geminiCacheService';

// Mock createUUID to avoid uuid import issues in Jest
jest.mock('../common/uuid', () => ({
    createUUID: jest.fn(() => 'mock-uuid'),
}));
import { createUUID } from '../common/uuid';

describe('LlmService', () => {
    let service: LlmService;
    let mockMessagePort: Partial<MessagePort>;
    let mockFileSearchAssistant: Partial<FileSearchAssistant>;
    let mockUserPort: Partial<UserPort>;
    let mockConversationPort: Partial<ConversationPort>;
    let mockPersonalityPresetService: Partial<PersonalityPresetService>;
    let mockInMemoryCacheService: Partial<InMemoryCacheService>;
    let mockGeminiCacheService: Partial<GeminiCacheService>;
    let mockUserService: any;

    const mockPreset: PersonalityPreset = {
        id: toPersonalityPresetId('test_preset'),
        displayName: 'Test Preset',
        description: 'Test Description',
        tone: 'Test Tone',
        depth: 'normal',
        strictness: 'normal',
        proactivity: 'normal',
        systemPromptCore: 'Test Core Prompt',
    } as PersonalityPreset;

    beforeEach(async () => {
        mockMessagePort = {
            findAllByConversation: jest.fn().mockResolvedValue([]),
        };
        mockFileSearchAssistant = {
            answerQuestion: jest.fn().mockResolvedValue({
                type: 'ANSWER',
                answer: 'Test Answer',
                message: { content: 'Test Answer' },
            }),
        };
        mockUserPort = {
            getUserMbti: jest.fn().mockResolvedValue(null),
        };
        mockConversationPort = {
            findById: jest.fn().mockResolvedValue({
                conversation_id: 'test-conv-id',
                owner_id: 'test-user-id',
            }),
        };
        mockPersonalityPresetService = {
            findById: jest.fn().mockReturnValue(mockPreset),
        };
        mockInMemoryCacheService = {
            getOrCreateConversation: jest.fn().mockResolvedValue([]),
            getOrCreateSystemPrompt: jest.fn().mockImplementation((_, generator) => generator()),
            appendToConversation: jest.fn(),
        };
        mockGeminiCacheService = {
            getOrCreateSystemPromptCache: jest.fn().mockResolvedValue('test-cache-name'),
        };
        mockUserService = {
            getUserPersonalityPreset: jest.fn().mockResolvedValue(toPersonalityPresetId('test_preset')),
        };

        // Mock UserPort to behave like UserService for the cast in LlmService
        Object.assign(mockUserPort, mockUserService);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LlmService,
                { provide: MESSAGE_PORT, useValue: mockMessagePort },
                { provide: FileSearchAssistant, useValue: mockFileSearchAssistant },
                { provide: USER_PORT, useValue: mockUserPort },
                { provide: CONVERSATION_PORT, useValue: mockConversationPort },
                { provide: PersonalityPresetService, useValue: mockPersonalityPresetService },
                { provide: InMemoryCacheService, useValue: mockInMemoryCacheService },
                { provide: GeminiCacheService, useValue: mockGeminiCacheService },
            ],
        }).compile();

        service = module.get<LlmService>(LlmService);
    });

    it('should generate system prompt with personality preset', async () => {
        const command = {
            prompt: 'Hello',
            conversationId: createUUID(),
            requireWebSearch: false,
        };

        await service.generate(command);

        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('プリセット ID: test_preset'),
                requireWebSearch: false,
            }),
        );
        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('Test Core Prompt'),
            }),
        );
    });

    it('should fallback to default preset if user preset not found', async () => {
        mockUserService.getUserPersonalityPreset.mockResolvedValue(null);
        mockPersonalityPresetService.findById = jest.fn().mockImplementation((id) => {
            if (id === 'default_assistant') return mockPreset;
            return undefined;
        });

        const command = {
            prompt: 'Hello',
            conversationId: createUUID(),
            requireWebSearch: false,
        };

        await service.generate(command);

        expect(mockPersonalityPresetService.findById).toHaveBeenCalledWith('default_assistant');
        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('プリセット ID: test_preset'), // default mock returns test_preset
            }),
        );
    });

    it('should include MBTI instruction when user has MBTI set', async () => {
        mockUserPort.getUserMbti = jest.fn().mockResolvedValue('INTJ');

        const command = {
            prompt: 'Hello',
            conversationId: createUUID(),
            requireWebSearch: false,
        };

        await service.generate(command);

        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('このユーザーのMBTIタイプは INTJ です。'),
            }),
        );
        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('プリセット ID: test_preset'),
            }),
        );
    });

    it('should pass requireWebSearch flag to FileSearchAssistant', async () => {
        const command = {
            prompt: 'Tell me about the latest AI trends',
            conversationId: createUUID(),
            requireWebSearch: true,
        };

        await service.generate(command);

        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Tell me about the latest AI trends',
            expect.objectContaining({
                requireWebSearch: true,
            }),
        );
    });

    it('should use relaxed FILE_SEARCH_INSTRUCTION', async () => {
        const command = {
            prompt: 'What is TypeScript?',
            conversationId: createUUID(),
            requireWebSearch: false,
        };

        await service.generate(command);

        // 緩和版のFILE_SEARCH_INSTRUCTIONが使われていることを確認
        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'What is TypeScript?',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('あなたの一般知識を使って有益な回答を提供してください'),
            }),
        );
    });

    it('should use caches correctly', async () => {
        const command = {
            prompt: 'Hello',
            conversationId: createUUID(),
            requireWebSearch: false,
        };

        await service.generate(command);

        // キャッシュメソッドが正しく呼ばれているか確認
        expect(mockInMemoryCacheService.getOrCreateConversation).toHaveBeenCalledWith(
            command.conversationId.toString(),
            expect.any(Function),
        );
        expect(mockInMemoryCacheService.getOrCreateSystemPrompt).toHaveBeenCalled();
        expect(mockGeminiCacheService.getOrCreateSystemPromptCache).toHaveBeenCalled();
        
        // メッセージがキャッシュに追加されているか確認
        expect(mockInMemoryCacheService.appendToConversation).toHaveBeenCalledTimes(2); // userMessage + assistantMessage
    });
});