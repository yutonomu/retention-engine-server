import { GoogleGenAI, type ImportFileOperation } from '@google/genai';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Message, UserRole } from '../../../Entity/Message';
import {
  type AnswerQuestionOptions,
  type AnswerQuestionResult,
  type FileSeed,
  type MultiStoreChatOptions,
  type PrepareStoresOptions,
  type StoreRegistry,
  type StoreSeed,
} from './multi-store-chat.types';
import { createUUID } from '../../../common/uuid';

const POLL_INTERVAL_MS = 5000;
const STORE_REGISTRY_PATH = path.resolve('store-registry.json');

function mapUserRoleToRole(role: UserRole) {
  return role === 'NEW_HIRE' ? ('user' as const) : ('model' as const);
}

export class MultiStoreChat {
  private readonly ai: GoogleGenAI;

  private storeRegistry: StoreRegistry = {};

  private storeRegistryLoaded = false;

  private storeNamesForSearch: string[] = [];

  private storesReadyPromise: Promise<void> | null = null;

  private filesImported = false;

  constructor(
    private readonly options: MultiStoreChatOptions,
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
    options?: AnswerQuestionOptions,
  ): Promise<AnswerQuestionResult> {
    if (!question?.trim()) {
      throw new Error('Question is required.');
    }

    await this.ensureStoresReady();
    const history = options?.history ?? [];

    const contents = history.map((message) => ({
      role: mapUserRoleToRole(message.userRole),
      parts: [{ text: message.content }],
    }));

    contents.push({
      role: 'user' as const,
      parts: [{ text: question }],
    });

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    });

    const answer = this.extractText(response);
    const conversationId = options?.conversationId ?? createUUID();
    const userMessage: Message = {
      messageId: createUUID(),
      conversationId,
      userRole: 'NEW_HIRE',
      content: question,
      createdAt: new Date(),
    };
    const assistantMessage: Message = {
      messageId: createUUID(),
      conversationId,
      userRole: 'ASSISTANT',
      content: answer,
      createdAt: new Date(),
    };

    return { answer, messages: [userMessage, assistantMessage] };
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
    const uploadedFile = await this.ai.files.upload({
      file: fileSeed.path,
      config: {
        displayName: fileSeed.displayName,
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

    await this.pollOperation(operation);
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
