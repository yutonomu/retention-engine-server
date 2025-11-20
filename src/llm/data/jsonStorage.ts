import * as path from 'path';

const JSON_STORAGE_ROOT =
  process.env.JSON_STORAGE_DIR ?? path.join('/tmp', 'retention-engine', 'json');

export function resolveJsonStoragePath(filename: string): string {
  return path.resolve(JSON_STORAGE_ROOT, filename);
}
