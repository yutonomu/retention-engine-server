import { Test, TestingModule } from '@nestjs/testing';
import { LlmService } from './llm.service';
import { MessagePort, MESSAGE_PORT } from '../message/message.port';
import { FileSearchAssistant } from './external/fileSearchAssistant';
import { UserPort, USER_PORT } from '../user/user.port';
import { ConversationPort, CONVERSATION_PORT } from '../conversation/conversation.port';
import { PersonalityPresetService } from '../personality-preset/personalityPreset.service';
import { PersonalityPreset, toPersonalityPresetId } from '../personality-preset/personalityPreset.types';
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
            ],
        }).compile();

        service = module.get<LlmService>(LlmService);
    });

    it('should generate system prompt with personality preset', async () => {
        const command = {
            prompt: 'Hello',
            conversationId: createUUID(),
        };

        await service.generate(command);

        expect(mockFileSearchAssistant.answerQuestion).toHaveBeenCalledWith(
            'Hello',
            expect.objectContaining({
                systemInstruction: expect.stringContaining('プリセット ID: test_preset'),
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
});
