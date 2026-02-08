/**
 * SSE (Server-Sent Events) イベント型定義
 *
 * ストリーミングレスポンスで使用される共通イベント型。
 * バックエンド（NestJS） → Next.js → フロントエンド の全レイヤーで共有。
 */

import type { FileSearchSource, WebSource } from './llmGenerateResponse.dto';

/**
 * SSEイベントタイプ
 */
export type SSEEventType = 'step' | 'chunk' | 'sources' | 'done' | 'error' | 'trigger' | 'session';

/**
 * パイプラインステップ識別子
 */
export type PipelineStep = 'file_search' | 'web_search' | 'synthesis';

/**
 * SSEイベントソース
 */
export type SSEEventSources = {
  fileSearch?: FileSearchSource[];
  webSearch?: WebSource[];
};

/**
 * SSEエラー情報
 */
export type SSEEventError = {
  code: string;
  message: string;
  retryable: boolean;
};

/**
 * SSEイベントメタデータ
 */
export type SSEEventMetadata = {
  step?: PipelineStep;
  sources?: SSEEventSources;
  error?: SSEEventError;
};

/**
 * SSEイベント
 *
 * - step: パイプラインステップの進行通知（例: "ドキュメント検索中..."）
 * - chunk: LLMからのテキストチャンク
 * - sources: ソース情報（ファイル検索 / Web検索）
 * - done: ストリーム完了
 * - error: エラー発生
 */
export type SSEEvent = {
  type: SSEEventType;
  data: string;
  metadata?: SSEEventMetadata;
};
