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
import { PersonalityPreset } from '../personality-preset/personalityPreset.types';

// FILE_SEARCH_INSTRUCTIONを定数として定義
const FILE_SEARCH_INSTRUCTION = `
あなたは、提供された【コンテキスト】に厳密に基づいて質問に回答するAIアシスタントです。以下のルールを必ず守ってください。

1. 厳密な事実に基づいた回答: コンテキストに含まれていない情報は一切含めず、「情報が見つかりませんでした」と答えてください。推測や一般常識は使わないでください。
2. 引用元の明記: 回答の各文がどのコンテキスト（ファイル名やチャンクIDなど）に基づいているかを、必ず引用形式で示してください（例: [onboarding-tips.txt, chunk-1]）。
3. 日本語での出力: 丁寧で平易な日本語で回答してください。

FileSearchが返すドキュメントの根拠が確認できない場合は、必ず「情報が見つかりませんでした」と返してください。
`.trim();

export type LlmGenerateCommand = {
  prompt: string;
  conversationId: UUID;
};

export type LlmGenerateResult = {
  answer: string;
  message: Message;
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
  ) { }

  async generate(command: LlmGenerateCommand): Promise<LlmGenerateResult> {
    this.logger.log(
      `Processing LLM generate command=${JSON.stringify(command)}`,
    );

    const history = await this.messagePort.findAllByConversation(
      command.conversationId.toString(),
    );

    this.logger.log(
      `Loaded conversation history conversationId="${command.conversationId}" messages=${JSON.stringify(
        history,
      )}`,
    );

    // 会話の所有者を取得
    const conversation = await this.conversationPort.findById(
      command.conversationId.toString(),
    );
    if (!conversation) {
      throw new Error(`Conversation ${command.conversationId} not found`);
    }
    if (!conversation.owner_id) {
      throw new Error(`Conversation ${command.conversationId} has no owner`);
    }

    // ユーザーの性格プリセットに基づいてシステムプロンプトを生成
    const systemInstruction = await this.generateSystemPrompt(conversation.owner_id);
    this.logger.log(
      `Generated system prompt for userId=${conversation.owner_id}`,
    );

    const userMessage: Message = {
      messageId: createUUID(),
      conversationId: command.conversationId,
      userRole: 'NEW_HIRE',
      content: command.prompt,
      createdAt: new Date(),
    };

    let llmResult: { answer: string; message: Message };
    try {
      llmResult = await this.fileSearchAssistant.answerQuestion(
        command.prompt,
        {
          conversationId: command.conversationId,
          history: [...(history as unknown as Message[]), userMessage],
          systemInstruction,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate answer via FileSearchAssistant conversationId="${command.conversationId}"`,
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
        answer: fallbackMessage.content,
        message: fallbackMessage,
      };
    }

    this.logger.log(
      `Appended assistant message to conversationId="${command.conversationId}" message=${JSON.stringify(
        llmResult.message,
      )}`,
    );

    return llmResult;
  }

  /**
   * ユーザーのプリセット設定に基づいてシステムプロンプトを生成
   * 二層構造: FILE_SEARCH_INSTRUCTION (ベース) + PersonalityPreset (性格)
   * 
   * FILE_SEARCH_INSTRUCTIONは常にプロンプトに含まれます（プリセットの有無に関わらず）
   */
  private async generateSystemPrompt(userId: string): Promise<string> {
    // 1. ユーザーのプリセット設定を取得
    // 注: UserPortインターフェースにgetUserPersonalityPresetメソッドがまだ追加されていないため、
    // 一時的にanyにキャストして実装クラス（UserService）のメソッドにアクセスしています。
    // TODO: UserPortインターフェースを更新してgetUserPersonalityPresetを追加する
    const userService = this.userPort as any;
    const presetId = await userService.getUserPersonalityPreset(userId) || 'default_assistant';

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
      const defaultPreset = this.personalityPresetService.findById('default_assistant');
      if (defaultPreset) {
        targetPreset = defaultPreset;
      }
    }

    // プリセットがある場合は、性格プリセットを含めた完全なプロンプトを構築
    if (targetPreset) {
      return this.buildSystemPromptFromPreset(targetPreset, mbtiInstruction);
    }

    // プリセットが全く見つからない場合でも、FILE_SEARCH_INSTRUCTIONは必ず含める
    this.logger.warn(
      `No personality preset found for userId=${userId}, using FILE_SEARCH_INSTRUCTION only`,
    );
    return `${FILE_SEARCH_INSTRUCTION}${mbtiInstruction}`;
  }

  /**
   * 二層プロンプト構造を構築
   * @param preset 性格プリセット
   * @param mbtiInstruction MBTIに基づく追加指示（ある場合）
   * @returns 完全なシステムプロンプト（ベース層 + 性格層 + MBTI層）
   */
  private buildSystemPromptFromPreset(preset: PersonalityPreset, mbtiInstruction: string): string {
    // 性格層のプロンプト
    const personalityPrompt = `
あなたは社内新人教育向けの RAG ベース AI アシスタントです。

これから会話するときは、次の「性格プリセット」の仕様に従って振る舞ってください。

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

    // ベース層（事実確認）+ 性格層（口調・スタイル）+ MBTI層（個別最適化）
    return `${FILE_SEARCH_INSTRUCTION}\n\n---\n\n${personalityPrompt}${mbtiInstruction}`;
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
}
