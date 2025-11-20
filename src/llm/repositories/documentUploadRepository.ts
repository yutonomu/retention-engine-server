import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { UUID } from '../../common/uuid';
import { resolveJsonStoragePath } from '../data/jsonStorage';

export type DocumentUploadRecord = {
  id: UUID;
  filePath: string;
  createdAt: Date;
  uploaded: boolean;
};

type StoredDocumentUploadRecord = {
  id: UUID;
  filePath: string;
  createdAt: string;
  uploaded: boolean;
};

type StoredDocumentUploadData = StoredDocumentUploadRecord[];

const DATA_FILE_PATH = resolveJsonStoragePath('documentUploadRecords.json');
const DEFAULT_DATA_FILE_PATH = path.resolve(
  process.cwd(),
  'src',
  'llm',
  'data',
  'documentUploadRecords.json',
);

@Injectable()
export class DocumentUploadRepository {
  private readonly logger = new Logger(DocumentUploadRepository.name);

  async getPendingDocuments(): Promise<DocumentUploadRecord[]> {
    const records = await this.readRecords();
    return records
      .filter((record) => !record.uploaded)
      .map((record) => ({
        ...record,
        createdAt: new Date(record.createdAt),
      }));
  }

  async markDocumentsUploaded(ids: UUID[]): Promise<void> {
    const records = await this.readRecords();
    const updated = records.map((record) =>
      ids.includes(record.id) ? { ...record, uploaded: true } : record,
    );
    await this.writeRecords(updated);
  }

  private async readRecords(): Promise<StoredDocumentUploadData> {
    try {
      const json = await fs.readFile(DATA_FILE_PATH, 'utf8');
      return JSON.parse(json) as StoredDocumentUploadData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        const fallback = await this.loadDefaultRecords();
        await this.writeRecords(fallback);
        return fallback;
      }
      throw error;
    }
  }

  private async writeRecords(records: StoredDocumentUploadData): Promise<void> {
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
    await fs.writeFile(
      DATA_FILE_PATH,
      JSON.stringify(records, null, 2),
      'utf8',
    );
  }

  private async loadDefaultRecords(): Promise<StoredDocumentUploadData> {
    try {
      const json = await fs.readFile(DEFAULT_DATA_FILE_PATH, 'utf8');
      return JSON.parse(json) as StoredDocumentUploadData;
    } catch (error) {
      this.logger.warn(
        `Default documentUploadRecords.json not found. Initializing with empty records. Reason: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
