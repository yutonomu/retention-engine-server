import {
  GoogleGenAI,
  type GenerateContentResponse,
  type GroundingChunk,
  type GroundingMetadata,
  type ImportFileOperation,
} from '@google/genai';
import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Message, UserRole } from '../../../Entity/Message';
import {
  type FileSeed,
  type GeminiFileSearchAssistantOptions,
  type PrepareStoresOptions,
  type StoreRegistry,
  type StoreSeed,
} from './geminiFileSearchAssistant.types';
import { createUUID } from '../../../common/uuid';
import type {
  FileDocument,
  FileSearchAnswerOptions,
  FileSearchAnswerResult,
} from '../fileSearchAssistant';
import type {
  FileSearchChunk,
  FileSearchSource,
} from '../../dto/llmGenerateResponse.dto';

const POLL_INTERVAL_MS = 5000;
const STORE_REGISTRY_PATH = path.resolve('store-registry.json');

// Retry設定
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatusCodes: [503, 429, 500],
};
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

【出力言語】
- 丁寧で分かりやすい日本語で回答する
`;

function mapUserRoleToRole(role: UserRole) {
  return role === 'NEW_HIRE' ? ('user' as const) : ('model' as const);
}

export class GeminiFileSearchClient {
  private readonly ai: GoogleGenAI;

  private readonly logger = new Logger(GeminiFileSearchClient.name);

  private storeRegistry: StoreRegistry = {};

  private storeRegistryLoaded = false;

  private storeNamesForSearch: string[] = [];

  private storesReadyPromise: Promise<void> | null = null;

  private filesImported = false;

  constructor(
    private readonly options: GeminiFileSearchAssistantOptions,
    apiKey: string,
  ) {
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY must be configured.');
    }

    this.ai = new GoogleGenAI({ apiKey });
  }

  async prepareStores(options?: PrepareStoresOptions): Promise<void> {
    await this.ensureStoresReady();
    if (options?.importFiles) {
      await this.importSeedFiles(Boolean(options.forceImport));
    }
  }

  async answerQuestion(
    question: string,
    options: FileSearchAnswerOptions,
  ): Promise<FileSearchAnswerResult> {
    if (!question?.trim()) {
      throw new Error('Question is required.');
    }

    await this.ensureStoresReady();
    const history = options.history ?? [];

    const instruction = options.systemInstruction
      ? `${FILE_SEARCH_INSTRUCTION.trim()}\n\n${options.systemInstruction}`
      : FILE_SEARCH_INSTRUCTION.trim();

    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: instruction }],
      },
      ...history.map((message) => ({
        role: mapUserRoleToRole(message.userRole),
        parts: [{ text: message.content }],
      })),
    ];

    contents.push({
      role: 'user' as const,
      parts: [{ text: question }],
    });

    // Retryロジック適用
    const response = await this.executeWithRetry(async () => {
      const requestConfig: any = {
        model: 'gemini-2.5-pro',
        contents,
        config: {
          tools: [
            {
              fileSearch: {
                fileSearchStoreNames: this.storeNamesForSearch,
              },
            },
          ],
        },
      };
      
      // systemInstructionが提供されている場合は追加
      if (options.systemInstruction) {
        requestConfig.config.systemInstruction = options.systemInstruction;
      }
      
      return this.ai.models.generateContent(requestConfig);
    });

    this.logCitedChunks(response);

    const answer = this.extractText(response);
    const fileSearchSources = this.extractCitations(response);
    const conversationId = options.conversationId;
    const assistantMessage: Message = {
      messageId: createUUID(),
      conversationId,
      userRole: 'ASSISTANT',
      content: answer,
      createdAt: new Date(),
    };

    // FileSearchSources構造に合わせてネスト
    const sources = fileSearchSources.length > 0
      ? { fileSearch: fileSearchSources }
      : undefined;

    return { answer, message: assistantMessage, sources };
  }

  /**
   * Exponential backoffを使用したretryロジック
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const statusCode = (error as { status?: number }).status;

        // リトライ可能なエラーか確認
        if (
          !statusCode ||
          !RETRY_CONFIG.retryableStatusCodes.includes(statusCode)
        ) {
          throw error;
        }

        // 最後の試行だったらエラーをthrow
        if (attempt === RETRY_CONFIG.maxRetries) {
          this.logger.error(
            `All ${RETRY_CONFIG.maxRetries + 1} attempts failed. Last error: ${lastError.message}`,
          );
          throw error;
        }

        // Exponential backoff計算
        const delay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs,
        );

        this.logger.warn(
          `API call failed with status ${statusCode}, retrying in ${delay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  async uploadDocuments(documents: FileDocument[]): Promise<void> {
    if (!documents.length) {
      return;
    }

    await this.ensureStoresReady();
    const [primaryStoreSeed] = this.options.storeSeeds;
    if (!primaryStoreSeed) {
      throw new Error('No FileSearch stores configured.');
    }
    const storeName = await this.ensureStore(primaryStoreSeed);
    const fileSeeds: FileSeed[] = documents.map((document) => ({
      path: path.resolve(document.filePath),
      displayName: document.displayName,
      mimeType: document.mimeType ?? 'application/octet-stream',
    }));

    await this.ensureFilesInStore(fileSeeds, storeName);
  }

  private async ensureStoreRegistryLoaded() {
    if (this.storeRegistryLoaded) {
      return;
    }
    this.storeRegistry = await this.loadStoreRegistry();
    this.storeRegistryLoaded = true;
  }

  private async ensureStoresReady() {
    if (!this.storesReadyPromise) {
      this.storesReadyPromise = (async () => {
        await this.ensureStoreRegistryLoaded();
        const createdNames = new Set<string>();
        for (const seed of this.options.storeSeeds) {
          const storeName = await this.ensureStore(seed);
          createdNames.add(storeName);
        }
        this.storeNamesForSearch = Array.from(createdNames);
      })();

      this.storesReadyPromise.catch(() => {
        this.storesReadyPromise = null;
      });
    }

    await this.storesReadyPromise;
  }

  private async ensureStore(seed: StoreSeed): Promise<string> {
    await this.ensureStoreRegistryLoaded();
    const persistedName =
      seed.existingName ?? this.storeRegistry[seed.displayName];
    if (persistedName) {
      await this.persistStoreName(seed.displayName, persistedName);
      return persistedName;
    }

    const created = await this.ai.fileSearchStores.create({
      config: { displayName: seed.displayName },
    });

    if (!created.name) {
      throw new Error(
        'FileSearchStore creation response did not include a name.',
      );
    }

    await this.persistStoreName(seed.displayName, created.name);
    return created.name;
  }

  private async ensureFilesInStore(files: FileSeed[], storeName: string) {
    for (const fileSeed of files) {
      console.log(
        `Ensuring FileSearch store (${storeName}) has file: ${fileSeed.displayName} (${fileSeed.path})`,
      );
      await this.uploadAndImportFile(fileSeed, storeName);
    }
  }

  private async importSeedFiles(force: boolean) {
    if (this.filesImported && !force) {
      return;
    }
    await this.ensureStoresReady();
    for (const seed of this.options.storeSeeds) {
      const storeName = await this.ensureStore(seed);
      await this.ensureFilesInStore(seed.files, storeName);
    }
    this.filesImported = true;
  }

  private async uploadAndImportFile(fileSeed: FileSeed, storeName: string) {
    const safeDisplayName = this.toSafeDisplayName(
      fileSeed.displayName ?? path.basename(fileSeed.path),
    );

    let tempFilePath: string | null = null;
    const uploadPath = await this.getSafeFilePath(fileSeed);
    if (uploadPath !== fileSeed.path) {
      tempFilePath = uploadPath;
    }

    const uploadedFile = await this.ai.files.upload({
      file: uploadPath,
      config: {
        displayName: safeDisplayName,
        mimeType: fileSeed.mimeType ?? 'text/plain',
      },
    });

    const uploadedFileName = uploadedFile.name;
    if (!uploadedFileName) {
      throw new Error('File upload response is missing a file name.');
    }

    const operation = await this.ai.fileSearchStores.importFile({
      fileSearchStoreName: storeName,
      fileName: uploadedFileName,
    });

    try {
      await this.pollOperation(operation);
    } finally {
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => undefined);
      }
    }
  }

  private toSafeDisplayName(name: string): string {
    // Gemini API headers reject non-ASCII bytes; replace them to avoid ByteString errors.
    const ascii = name.normalize('NFKD').replace(/[^\x20-\x7E]/g, '_');
    return ascii || 'file';
  }

  private async getSafeFilePath(fileSeed: FileSeed): Promise<string> {
    const baseName = path.basename(fileSeed.path);
    // If basename is already ASCII, no need to copy.
    if (/^[\x20-\x7E]+$/.test(baseName)) {
      return fileSeed.path;
    }

    const safeBaseName = this.toSafeDisplayName(baseName);
    const tempPath = path.join(
      os.tmpdir(),
      `gemini-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBaseName}`,
    );
    await fs.copyFile(fileSeed.path, tempPath);
    return tempPath;
  }

  private async pollOperation(
    operation: ImportFileOperation,
  ): Promise<ImportFileOperation> {
    let currentOp = operation;
    while (!currentOp.done) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      currentOp = await this.ai.operations.get({ operation: currentOp });
    }

    if (currentOp.error) {
      throw new Error('File import operation failed.');
    }

    return currentOp;
  }

  private async loadStoreRegistry(): Promise<StoreRegistry> {
    try {
      const json = await fs.readFile(STORE_REGISTRY_PATH, 'utf8');
      return JSON.parse(json) as StoreRegistry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async persistStoreName(displayName: string, storeName: string) {
    await this.ensureStoreRegistryLoaded();
    if (this.storeRegistry[displayName] === storeName) {
      return;
    }
    this.storeRegistry[displayName] = storeName;
    await fs.writeFile(
      STORE_REGISTRY_PATH,
      JSON.stringify(this.storeRegistry, null, 2),
      'utf8',
    );
  }

  private logCitedChunks(response: GenerateContentResponse): void {
    const candidates = response.candidates ?? [];
    if (!candidates.length) {
      return;
    }

    candidates.forEach((candidate, candidateIndex) => {
      const groundingMetadata = candidate?.groundingMetadata;
      if (!groundingMetadata) {
        return;
      }
      this.logGroundingMetadata(groundingMetadata, candidateIndex);
    });
  }

  /**
   * Extract structured citation data from Gemini response
   * Parses groundingMetadata.groundingChunks and groups by file/document
   */
  private extractCitations(
    response: GenerateContentResponse,
  ): FileSearchSource[] {
    const candidates = response.candidates ?? [];
    if (!candidates.length) {
      return [];
    }

    // Collect all chunks from all candidates
    const allChunks: GroundingChunk[] = [];
    for (const candidate of candidates) {
      const groundingMetadata = candidate?.groundingMetadata;
      if (!groundingMetadata?.groundingChunks) {
        continue;
      }
      allChunks.push(...groundingMetadata.groundingChunks);
    }

    if (!allChunks.length) {
      return [];
    }

    // Group chunks by file/document name
    const sourceMap = new Map<string, FileSearchChunk[]>();

    for (const chunk of allChunks) {
      const fileName = this.describeChunk(chunk);
      const chunkData = this.convertChunkToFileSearchChunk(chunk);

      if (!sourceMap.has(fileName)) {
        sourceMap.set(fileName, []);
      }
      sourceMap.get(fileName)!.push(chunkData);
    }

    // Convert map to FileSearchSource array
    const sources: FileSearchSource[] = Array.from(
      sourceMap.entries(),
    ).map(([fileName, chunks]) => ({
      fileName,
      documentId: this.extractDocumentId(chunks[0]),
      chunks,
    }));

    return sources;
  }

  /**
   * Convert Gemini GroundingChunk to FileSearchChunk
   */
  private convertChunkToFileSearchChunk(
    chunk: GroundingChunk,
  ): FileSearchChunk {
    const text = this.extractChunkSnippet(chunk) ?? '';
    const pageSpan = chunk.retrievedContext?.ragChunk?.pageSpan;

    return {
      chunkId: this.extractChunkId(chunk),
      text,
      pageStart: pageSpan?.firstPage,
      pageEnd: pageSpan?.lastPage,
      confidence: this.extractConfidence(chunk),
    };
  }

  /**
   * Extract chunk ID from GroundingChunk
   */
  private extractChunkId(chunk: GroundingChunk): string | undefined {
    // Try to extract chunk ID from various possible locations
    const retrieved = chunk.retrievedContext;
    if (retrieved?.ragChunk) {
      // Use document name as a fallback chunk identifier
      return this.extractDocName(retrieved.documentName) ?? undefined;
    }
    return undefined;
  }

  /**
   * Extract document ID from chunk
   */
  private extractDocumentId(chunk: FileSearchChunk): string | undefined {
    return chunk.chunkId;
  }

  /**
   * Extract confidence score from chunk
   * Note: Gemini API may not always provide explicit confidence scores
   */
  private extractConfidence(chunk: GroundingChunk): number | undefined {
    // Gemini API doesn't expose confidence directly in current version
    // This is a placeholder for future API enhancements
    return undefined;
  }

  private logGroundingMetadata(
    metadata: GroundingMetadata,
    candidateIndex: number,
  ): void {
    const chunks = metadata.groundingChunks ?? [];
    const supports = metadata.groundingSupports ?? [];

    if (!chunks.length) {
      return;
    }

    if (!supports.length) {
      chunks.forEach((chunk, chunkIndex) => {
        const description = this.describeChunk(chunk);
        const snippet = this.extractChunkSnippet(chunk);
        const pageSpan = this.formatPageSpan(chunk);
        this.logger.log(
          [
            `Gemini FileSearch retrieved chunk (candidate=${candidateIndex}, chunk=${chunkIndex})`,
            `source="${description}"`,
            pageSpan ? `pages=${pageSpan}` : null,
            snippet ? `chunkSnippet="${snippet}"` : null,
            '[no grounding support metadata]',
          ]
            .filter(Boolean)
            .join(' '),
        );
      });
      return;
    }

    supports.forEach((support, supportIndex) => {
      const segmentText = support.segment?.text?.trim();
      (support.groundingChunkIndices ?? []).forEach((chunkIndex) => {
        const chunk = chunks[chunkIndex];
        if (!chunk) {
          return;
        }
        const description = this.describeChunk(chunk);
        const snippet = this.extractChunkSnippet(chunk);
        const pageSpan = this.formatPageSpan(chunk);
        this.logger.log(
          [
            `Gemini FileSearch citation (candidate=${candidateIndex}, support=${supportIndex}, chunk=${chunkIndex})`,
            `source="${description}"`,
            pageSpan ? `pages=${pageSpan}` : null,
            snippet ? `chunkSnippet="${snippet}"` : null,
            segmentText
              ? `answerSegment="${this.truncate(segmentText)}"`
              : null,
          ]
            .filter(Boolean)
            .join(' '),
        );
      });
    });
  }

  private describeChunk(chunk: GroundingChunk): string {
    const retrieved = chunk.retrievedContext;
    if (retrieved) {
      return (
        retrieved.title ??
        this.extractDocName(retrieved.documentName) ??
        retrieved.uri ??
        'retrieved-context'
      );
    }

    if (chunk.web) {
      return chunk.web.title ?? chunk.web.uri ?? 'web-chunk';
    }

    if (chunk.maps) {
      return chunk.maps.title ?? 'maps-chunk';
    }

    return 'unknown-chunk';
  }

  private extractChunkSnippet(chunk: GroundingChunk): string | null {
    const text =
      chunk.retrievedContext?.ragChunk?.text ??
      chunk.retrievedContext?.text ??
      chunk.web?.title ??
      chunk.web?.uri;

    const trimmed = text?.trim();
    if (!trimmed) {
      return null;
    }
    return this.truncate(trimmed);
  }

  private formatPageSpan(chunk: GroundingChunk): string | null {
    const span = chunk.retrievedContext?.ragChunk?.pageSpan;
    if (!span) {
      return null;
    }

    const first = span.firstPage ?? span.lastPage;
    const last = span.lastPage ?? span.firstPage;

    if (!first && !last) {
      return null;
    }

    if (first && last && first !== last) {
      return `${first}-${last}`;
    }

    return String(first ?? last);
  }

  private extractDocName(documentName?: string): string | null {
    if (!documentName) {
      return null;
    }

    const segments = documentName.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }

    return segments[segments.length - 1] ?? null;
  }

  private truncate(text: string, maxLength = 200): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength)}...`;
  }

  private extractText(response: unknown): string {
    if (
      typeof response === 'object' &&
      response !== null &&
      typeof (response as { text?: unknown }).text === 'string'
    ) {
      const directText = (response as { text: string }).text.trim();
      if (directText) {
        return directText;
      }
    }

    const candidatesRaw =
      typeof response === 'object' &&
        response !== null &&
        Array.isArray((response as { candidates?: unknown }).candidates)
        ? (response as { candidates: unknown[] }).candidates
        : [];

    for (const candidate of candidatesRaw) {
      if (
        typeof candidate !== 'object' ||
        candidate === null ||
        typeof (candidate as { content?: unknown }).content !== 'object' ||
        (candidate as { content?: unknown }).content === null
      ) {
        continue;
      }

      const content = candidate as { content?: { parts?: unknown } };
      const maybeParts = content.content?.parts;
      if (!Array.isArray(maybeParts)) {
        continue;
      }

      for (const part of maybeParts) {
        if (
          typeof part === 'object' &&
          part !== null &&
          typeof (part as { text?: unknown }).text === 'string'
        ) {
          const text = (part as { text: string }).text.trim();
          if (text) {
            return text;
          }
        }
      }
    }

    const finishReason =
      candidatesRaw.length > 0 &&
        typeof (candidatesRaw[0] as { finishReason?: unknown }).finishReason ===
        'string'
        ? (candidatesRaw[0] as { finishReason: string }).finishReason
        : 'unknown';

    throw new Error(
      `Model response did not include plain text (finishReason: ${finishReason})`,
    );
  }
}
