import { Inject, Injectable, Logger } from '@nestjs/common';
import * as messagePort from '../message/message.port';
import { MESSAGE_PORT } from '../message/message.port';
import { USER_PORT } from '../user/user.port';
import type { UserPort } from '../user/user.port';
import { CONVERSATION_PORT } from '../conversation/conversation.port';
import type { ConversationPort } from '../conversation/conversation.port';
import {
  FileSearchAssistant,
  type FileDocument,
} from './external/fileSearchAssistant';
import type { Message } from '../Entity/Message';
import { createUUID } from '../common/uuid';
import type { UUID } from '../common/uuid';
import * as path from 'path';
import { MBTI_COMMUNICATION_STYLES } from '../user/mbti.types';
import { PersonalityPresetService } from '../personality-preset/personalityPreset.service';
import { PersonalityPreset, type PersonalityPresetId, toPersonalityPresetId } from '../personality-preset/personalityPreset.types';
import { ResponseType, type WebSource, type FileSearchSource } from './dto/llmGenerateResponse.dto';
import type { SSEEvent } from './dto/sseEvent.types';
import type { HybridAnswerResult } from './external/hybridRagAssistantV2';
import { InMemoryCacheService } from './cache/inMemoryCacheService';
import { GeminiCacheService } from './cache/geminiCacheService';
import { MENTOR_KNOWLEDGE_ELICITATION_INSTRUCTION } from './prompts';

// FILE_SEARCH_INSTRUCTIONを定数として定義（改善版）
const FILE_SEARCH_INSTRUCTION = `
あなたは社内ドキュメント検索システム（FileSearch）を活用するAIアシスタントです。以下のルールに従って回答してください：

【重要な原則】
1. FileSearchで検索されたドキュメントを最優先で使用し、質問に最も適切なドキュメントを精査してから回答する
2. 情報源を明確に区別して伝える

【回答方法】
■ ドキュメントに情報がある場合：
- FileSearchで取得したドキュメントの内容に基づいて正確に回答
- 引用元を明記する（例: [ファイル名, チャンクID]）
- ドキュメントの内容を忠実に反映し、勝手な解釈を加えない

■ ドキュメントに情報がない場合：
- 「社内ドキュメントには該当する情報が見つかりませんでしたが、私の知識では...」と前置きする
- 「これは私の推論ですが...」「一般的な知識として...」など、情報源を明確にする
- あくまで参考情報として提供し、確実性が低いことを示す

■ 部分的に情報がある場合：
- ドキュメントにある部分は引用元を明記して正確に伝える
- ドキュメントにない部分は「これ以降は私の推論ですが...」と明確に区別する

【質問への対応】
- 質問内容を正確に理解し、最も関連性の高いドキュメントを選択する
- 複数のドキュメントに関連情報がある場合は、それぞれから適切に引用する
- ドキュメントの検索結果を精査し、古い情報と新しい情報がある場合は日付を確認する

【会話の原則】
- 「上長に確認してください」「担当者に聞いてください」「チームリーダーに相談してください」のように第三者に丸投げしない
- ドキュメントに情報がなくても、まずユーザー自身の状況を聞いて一緒に考える姿勢を取る
- 「あなたの場合はどうですか？」「具体的にはどういう状況ですか？」のように、ユーザーに問いかけて会話を続ける

【名前の扱い】
- ユーザーの名前がわからない場合は、「○○様」「○○さん」などの仮の名前を使わない
- 名前を知らない相手には「あなた」を使うか、主語を省略する

【出力言語】
- 丁寧で分かりやすい日本語で回答する
`.trim();

// ユーザーとの対話を深め、暗黙知を引き出すための指示
const KNOWLEDGE_ELICITATION_INSTRUCTION = `
【ユーザーとの対話を深める】
回答の最後に、ユーザー自身の状況や経験を確認する質問を1つだけ追加してください。

■ 通常の質問の場合:
- ユーザーの具体的な状況を確認する質問を追加する
- 例: 「何日くらい取得する予定ですか？」「金額はどのくらいですか？」「どういう状況ですか？」

■ 暗黙知のシグナルを検出した場合:
（「うちでは〜」「普段は〜」「いつもは〜」「〜というルールがある」「〜で困った」など）
- より踏み込んだ深掘り質問にする
- 例: 「それは○○の場合も同じ対応ですか？」「例外的なケースはありますか？」「その判断基準は？」

■ ルール:
- 質問は回答の最後に1つだけ（複数聞かない）
- 「上長に聞いてください」「担当者に確認してください」のように第三者に振らない
- ユーザーが「ありがとう」「わかりました」など会話を終えたい場合は質問しない
`.trim();

export type LlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
  requireWebSearch: boolean;
};

export type MentorLlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
};

export type LlmGenerateResult = {
  type: ResponseType;
  answer: string;
  message: Message;
  sources?: {
    fileSearch?: FileSearchSource[];
    webSearch?: WebSource[];
  };
};

export type UploadDocumentCommand = {
  filePath: string;
  displayName?: string;
  mimeType?: string;
  id?: UUID;
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    @Inject(MESSAGE_PORT)
    private readonly messagePort: messagePort.MessagePort,
    @Inject(FileSearchAssistant)
    private readonly fileSearchAssistant: FileSearchAssistant,
    @Inject(USER_PORT)
    private readonly userPort: UserPort,
    @Inject(CONVERSATION_PORT)
    private readonly conversationPort: ConversationPort,
    private readonly personalityPresetService: PersonalityPresetService,
    private readonly inMemoryCacheService: InMemoryCacheService,
    private readonly geminiCacheService: GeminiCacheService,
  ) { }

  async generate(command: LlmGenerateCommand): Promise<LlmGenerateResult> {
    // デバッグ: サービスレベルでの重複処理検出
    const serviceRequestId = `svc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const stackTrace = new Error().stack?.split('\n').slice(1, 5).join('\n');
    
    this.logger.log(
      `[${serviceRequestId}] Processing LLM generate command: ` +
        `webSearch=${command.requireWebSearch} ` +
        `conversationId=${command.conversationId} ` +
        `promptLength=${command.prompt.length} ` +
        `timestamp=${new Date().toISOString()}`,
    );
    
    this.logger.debug(
      `[${serviceRequestId}] Service stack trace: ${stackTrace}`,
    );

    // 会話の所有者を取得
    const conversation = await this.conversationPort.findById(
      command.conversationId.toString(),
    );

    // Conversation 검증 - 친절한 에러 응답 반환
    if (!conversation) {
      this.logger.error(`Conversation not found: ${command.conversationId}`);
      return this.createErrorResponse(
        command.conversationId,
        '会話が見つかりませんでした。新しい会話を開始してください。',
      );
    }
    if (!conversation.owner_id) {
      this.logger.error(`Conversation has no owner: ${command.conversationId}`);
      return this.createErrorResponse(
        command.conversationId,
        '会話の所有者情報が見つかりませんでした。再度ログインしてください。',
      );
    }

    // キャッシュを通じた会話履歴取得
    const history = await this.inMemoryCacheService.getOrCreateConversation<Message>(
      command.conversationId.toString(),
      async () => {
        const messages = await this.messagePort.findAllByConversation(
          command.conversationId.toString(),
        );
        return messages as unknown as Message[];
      },
    );

    this.logger.log(
      `Loaded conversation history conversationId="${command.conversationId}" count=${history.length}`,
    );

    // キャッシュを通じたシステムプロンプト生成（NEW_HIRE role）
    const systemInstruction = await this.inMemoryCacheService.getOrCreateSystemPrompt(
      `${conversation.owner_id}:NEW_HIRE`,
      async () => this.generateSystemPrompt(conversation.owner_id, 'NEW_HIRE'),
    );

    // Gemini Context Caching試行（トークンコスト削減）
    let geminiCacheName: string | null = null;
    try {
      geminiCacheName = await this.geminiCacheService.getOrCreateSystemPromptCache(
        `${conversation.owner_id}:NEW_HIRE`,
        systemInstruction,
        'gemini-2.0-flash',
      );
      if (geminiCacheName) {
        this.logger.log(`Gemini cache ready: ${geminiCacheName}`);
      }
    } catch (error) {
      this.logger.warn('Failed to create Gemini cache, proceeding without caching', error);
    }

    this.logger.log(
      `System prompt ready for userId=${conversation.owner_id}`,
    );

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };

    let llmResult: LlmGenerateResult;
    try {
      // HybridRagAssistantを通じて回答生成
      const result = (await this.fileSearchAssistant.answerQuestion(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
          requireWebSearch: command.requireWebSearch,
          geminiCacheName: geminiCacheName ?? undefined,
        },
      )) as HybridAnswerResult;

      llmResult = {
        type: result.type,
        answer: result.answer,
        message: result.message,
        sources: result.sources,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate answer via HybridRagAssistant conversationId="${command.conversationId}"`,
        error as Error,
      );
      const fallbackMessage: Message = {
        messageId: createUUID(),
        conversationId: command.conversationId,
        userRole: 'ASSISTANT',
        content:
          '申し訳ありません、現在回答を生成できませんでした。しばらくしてから再度お試しください。',
        createdAt: new Date(),
      };
      llmResult = {
        type: ResponseType.ANSWER,
        answer: fallbackMessage.content,
        message: fallbackMessage,
      };
    }

    this.logger.log(
      `Generated answer: type=${llmResult.type} length=${llmResult.answer.length}`,
    );

    // 会話キャッシュにユーザーメッセージとレスポンスメッセージを追加
    this.inMemoryCacheService.appendToConversation(
      command.conversationId.toString(),
      userMessage,
    );
    this.inMemoryCacheService.appendToConversation(
      command.conversationId.toString(),
      llmResult.message,
    );

    return llmResult;
  }

  /**
   * ストリーミング版 回答生成
   * SSEイベントをyieldするAsyncGenerator
   */
  async *generateStream(command: LlmGenerateCommand): AsyncGenerator<SSEEvent> {
    this.logger.log(
      `Processing LLM generate command (streaming): ` +
        `webSearch=${command.requireWebSearch} ` +
        `conversationId=${command.conversationId}`,
    );

    const conversation = await this.conversationPort.findById(
      command.conversationId.toString(),
    );

    if (!conversation) {
      yield {
        type: 'error',
        data: '会話が見つかりませんでした。',
        metadata: { error: { code: 'NOT_FOUND', message: '会話が見つかりませんでした。新しい会話を開始してください。', retryable: false } },
      };
      return;
    }
    if (!conversation.owner_id) {
      yield {
        type: 'error',
        data: '会話の所有者情報が見つかりませんでした。',
        metadata: { error: { code: 'NOT_FOUND', message: '会話の所有者情報が見つかりませんでした。再度ログインしてください。', retryable: false } },
      };
      return;
    }

    const history = await this.inMemoryCacheService.getOrCreateConversation<Message>(
      command.conversationId.toString(),
      async () => {
        const messages = await this.messagePort.findAllByConversation(
          command.conversationId.toString(),
        );
        return messages as unknown as Message[];
      },
    );

    const systemInstruction = await this.inMemoryCacheService.getOrCreateSystemPrompt(
      `${conversation.owner_id}:NEW_HIRE`,
      async () => this.generateSystemPrompt(conversation.owner_id, 'NEW_HIRE'),
    );

    let geminiCacheName: string | null = null;
    try {
      geminiCacheName = await this.geminiCacheService.getOrCreateSystemPromptCache(
        `${conversation.owner_id}:NEW_HIRE`,
        systemInstruction,
        'gemini-2.0-flash',
      );
    } catch (error) {
      this.logger.warn('Failed to create Gemini cache for streaming', error);
    }

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };

    // HybridRagAssistant のストリーミング版を呼び出し
    const hybridAssistant = this.fileSearchAssistant as any;
    if (typeof hybridAssistant.answerQuestionStream !== 'function') {
      // ストリーミング非対応の場合はバッチモードでフォールバック
      yield { type: 'step', data: '回答生成中...', metadata: { step: 'file_search' } };

      const result = await this.fileSearchAssistant.answerQuestion(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
          requireWebSearch: command.requireWebSearch,
          geminiCacheName: geminiCacheName ?? undefined,
        },
      ) as HybridAnswerResult;

      yield { type: 'chunk', data: result.answer };
      if (result.sources) {
        yield { type: 'sources', data: '', metadata: { sources: result.sources } };
      }
      yield { type: 'done', data: '' };

      // キャッシュ更新
      this.inMemoryCacheService.appendToConversation(command.conversationId.toString(), userMessage);
      this.inMemoryCacheService.appendToConversation(command.conversationId.toString(), result.message);
      return;
    }

    let fullAnswer = '';
    try {
      for await (const event of hybridAssistant.answerQuestionStream(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
          requireWebSearch: command.requireWebSearch,
          geminiCacheName: geminiCacheName ?? undefined,
        },
      )) {
        if (event.type === 'chunk') {
          fullAnswer += event.data;
        }
        yield event;
      }
    } catch (error) {
      this.logger.error('Streaming generation failed', error);
      yield {
        type: 'error',
        data: '回答生成中にエラーが発生しました',
        metadata: {
          error: {
            code: 'GENERATION_ERROR',
            message: (error as Error).message,
            retryable: true,
          },
        },
      };
    }

    // キャッシュにメッセージを追加
    this.inMemoryCacheService.appendToConversation(
      command.conversationId.toString(),
      userMessage,
    );
    if (fullAnswer) {
      const assistantMessage: Message = {
        messageId: createUUID(),
        conversationId: command.conversationId,
        userRole: 'ASSISTANT',
        content: fullAnswer,
        createdAt: new Date(),
      };
      this.inMemoryCacheService.appendToConversation(
        command.conversationId.toString(),
        assistantMessage,
      );
    }
  }

  /**
   * メンターAI対話用 — メンターの暗黙知を引き出す対話を生成
   */
  async generateForMentor(command: MentorLlmGenerateCommand): Promise<LlmGenerateResult> {
    const conversation = await this.conversationPort.findById(
      command.conversationId.toString(),
    );

    if (!conversation) {
      this.logger.error(`Conversation not found: ${command.conversationId}`);
      return this.createErrorResponse(
        command.conversationId,
        '会話が見つかりませんでした。新しい会話を開始してください。',
      );
    }
    if (!conversation.owner_id) {
      this.logger.error(`Conversation has no owner: ${command.conversationId}`);
      return this.createErrorResponse(
        command.conversationId,
        '会話の所有者情報が見つかりませんでした。再度ログインしてください。',
      );
    }

    const history = await this.inMemoryCacheService.getOrCreateConversation<Message>(
      command.conversationId.toString(),
      async () => {
        const messages = await this.messagePort.findAllByConversation(
          command.conversationId.toString(),
        );
        return messages as unknown as Message[];
      },
    );

    this.logger.log(
      `[MentorAI] Loaded history conversationId="${command.conversationId}" count=${history.length}`,
    );

    // キャッシュを通じたシステムプロンプト生成（MENTOR role）
    const systemInstruction = await this.inMemoryCacheService.getOrCreateSystemPrompt(
      `${conversation.owner_id}:MENTOR`,
      async () => this.generateSystemPrompt(conversation.owner_id, 'MENTOR'),
    );

    // Gemini Context Caching試行（トークンコスト削減）
    let geminiCacheName: string | null = null;
    try {
      geminiCacheName = await this.geminiCacheService.getOrCreateSystemPromptCache(
        `${conversation.owner_id}:MENTOR`,
        systemInstruction,
        'gemini-2.0-flash',
      );
      if (geminiCacheName) {
        this.logger.log(`[MentorAI] Gemini cache ready: ${geminiCacheName}`);
      }
    } catch (error) {
      this.logger.warn('[MentorAI] Failed to create Gemini cache, proceeding without caching', error);
    }

    this.logger.log(
      `[MentorAI] System prompt ready for userId=${conversation.owner_id}`,
    );

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'MENTOR',
      content: command.prompt,
      createdAt: new Date(),
    };

    let llmResult: LlmGenerateResult;
    try {
      const result = (await this.fileSearchAssistant.answerQuestion(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
          requireWebSearch: false,
          geminiCacheName: geminiCacheName ?? undefined,
        },
      )) as HybridAnswerResult;

      llmResult = {
        type: result.type,
        answer: result.answer,
        message: {
          ...result.message,
          userRole: 'ASSISTANT',
        },
        sources: result.sources,
      };
    } catch (error) {
      this.logger.error(
        `[MentorAI] Failed to generate answer conversationId="${command.conversationId}"`,
        error as Error,
      );
      const fallbackMessage: Message = {
        messageId: createUUID(),
        conversationId: command.conversationId,
        userRole: 'ASSISTANT',
        content:
          '申し訳ありません、現在回答を生成できませんでした。しばらくしてから再度お試しください。',
        createdAt: new Date(),
      };
      llmResult = {
        type: ResponseType.ANSWER,
        answer: fallbackMessage.content,
        message: fallbackMessage,
      };
    }

    this.inMemoryCacheService.appendToConversation(
      command.conversationId.toString(),
      userMessage,
    );
    this.inMemoryCacheService.appendToConversation(
      command.conversationId.toString(),
      llmResult.message,
    );

    return llmResult;
  }

  /**
   * ユーザーのプリセット設定に基づいてシステムプロンプトを生成
   * 二層構造: FILE_SEARCH_INSTRUCTION (ベース) + PersonalityPreset (性格)
   * 
   * FILE_SEARCH_INSTRUCTIONは常にプロンプトに含まれます（プリセットの有無に関わらず）
   */
  private async generateSystemPrompt(userId: string, role: 'NEW_HIRE' | 'MENTOR' = 'NEW_HIRE'): Promise<string> {
    // 1. ユーザーのプリセット設定を取得
    const presetId = await this.userPort.getUserPersonalityPreset(userId) || toPersonalityPresetId('default_assistant');

    // 2. MBTI情報を取得
    const userMbti = await this.userPort.getUserMbti(userId);
    let mbtiInstruction = '';

    if (userMbti) {
      const communicationStyle = MBTI_COMMUNICATION_STYLES[userMbti];
      mbtiInstruction = `\n\n---\n\nこのユーザーのMBTIタイプは ${userMbti} です。\n${communicationStyle}`;
      this.logger.log(
        `MBTI personalization applied: type=${userMbti} for userId=${userId}`,
      );
    }

    // 3. プリセット詳細を取得
    const preset = this.personalityPresetService.findById(presetId);
    let targetPreset = preset;

    if (!targetPreset) {
      // フォールバック：デフォルトプリセット
      const defaultPreset = this.personalityPresetService.findById(toPersonalityPresetId('default_assistant'));
      if (defaultPreset) {
        targetPreset = defaultPreset;
      }
    }

    // プリセットがある場合は、性格プリセットを含めた完全なプロンプトを構築
    if (targetPreset) {
      return this.buildSystemPromptFromPreset(targetPreset, mbtiInstruction, role);
    }

    // プリセットが全く見つからない場合でも、FILE_SEARCH_INSTRUCTIONは必ず含める
    const elicitationInstruction = role === 'MENTOR'
      ? MENTOR_KNOWLEDGE_ELICITATION_INSTRUCTION
      : KNOWLEDGE_ELICITATION_INSTRUCTION;

    this.logger.warn(
      `No personality preset found for userId=${userId}, using FILE_SEARCH_INSTRUCTION only`,
    );
    return `${FILE_SEARCH_INSTRUCTION}\n\n---\n\n${elicitationInstruction}${mbtiInstruction}`;
  }

  /**
   * 二層プロンプト構造を構築
   * @param preset 性格プリセット
   * @param mbtiInstruction MBTIに基づく追加指示（ある場合）
   * @returns 完全なシステムプロンプト（ベース層 + 性格層 + MBTI層）
   */
  private buildSystemPromptFromPreset(preset: PersonalityPreset, mbtiInstruction: string, role: 'NEW_HIRE' | 'MENTOR' = 'NEW_HIRE'): string {
    // 性格層のプロンプト
    const personalityPrompt = `
あなたは社内新人教育向けの RAG ベース AI アシスタントです。

これから会話するときは、次の「性格プリセット」の仕様に従って振る舞ってください。
重要: ユーザーの名前がわからない場合は「○○様」「○○さん」のような仮の名前を絶対に使わないでください。

- プリセット ID: ${preset.id}
- 名前: ${preset.displayName}
- 説明: ${preset.description}
- 口調: ${preset.tone}
- 回答の深さ: ${preset.depth}
- 厳しさレベル: ${preset.strictness}
- 積極性: ${preset.proactivity}

プリセットごとの追加指示:
${preset.systemPromptCore}

上記の性格・スタイルで振る舞いつつ、RAG により取得した社内ドキュメントの内容を踏まえて、
新人が安心して学べるように回答してください。
`.trim();

    // 役割に応じた暗黙知引き出し指示を選択
    const elicitationInstruction = role === 'MENTOR'
      ? MENTOR_KNOWLEDGE_ELICITATION_INSTRUCTION
      : KNOWLEDGE_ELICITATION_INSTRUCTION;

    // ベース層（事実確認）+ 深掘り層（暗黙知引き出し）+ 性格層（口調・スタイル）+ MBTI層（個別最適化）
    return `${FILE_SEARCH_INSTRUCTION}\n\n---\n\n${elicitationInstruction}\n\n---\n\n${personalityPrompt}${mbtiInstruction}`;
  }

  async uploadDocument(command: UploadDocumentCommand): Promise<void> {
    const fileDocument: FileDocument = {
      id: command.id ?? createUUID(),
      filePath: command.filePath,
      displayName:
        command.displayName ?? this.extractDisplayName(command.filePath),
      mimeType: command.mimeType ?? this.detectMimeType(command.filePath),
    };

    await this.fileSearchAssistant.uploadDocuments([fileDocument]);
    this.logger.log(
      `Uploaded document to FileSearch: displayName="${fileDocument.displayName}" path="${fileDocument.filePath}"`,
    );
  }

  private extractDisplayName(filePath: string): string {
    return path.basename(filePath);
  }

  private detectMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    switch (extension) {
      case '.txt':
        return 'text/plain';
      case '.pdf':
        return 'application/pdf';
      case '.md':
        return 'text/markdown';
      case '.json':
        return 'application/json';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * エラー時の統一レスポンス生成ヘルパー
   */
  private createErrorResponse(
    conversationId: UUID,
    message: string,
  ): LlmGenerateResult {
    return {
      type: ResponseType.ANSWER,
      answer: message,
      message: {
        messageId: createUUID(),
        conversationId,
        userRole: 'ASSISTANT',
        content: message,
        createdAt: new Date(),
      },
    };
  }
}
