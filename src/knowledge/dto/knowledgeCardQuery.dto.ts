import type { KCStatus, KCSourceType } from '../knowledge.types';

export interface KnowledgeCardQueryDto {
  status?: KCStatus;
  sourceType?: KCSourceType;
  search?: string;
  tags?: string; // comma-separated
  limit?: string;
  offset?: string;
}
