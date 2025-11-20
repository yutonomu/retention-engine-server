## TypeScript ファイル命名規約

- `src/` 以下の TypeScript ファイルとディレクトリ名には **lowerCamelCase** を使用し、kebab-case（ハイフン区切り）は使わない。
- ファイル名は公開している主要クラス/型と揃える（例: `GeminiFileSearchClient` → `geminiFileSearchClient.ts`、対応するサービス/設定/型も `geminiFileSearchAssistantService.ts` など）。
- パイプ、ガード、リポジトリなど NestJS 固有のファイルでも `zodValidation.pipe.ts` のように lowerCamelCase を保つ。
- テストファイルも同様に lowerCamelCase を用い、Jest 等の設定ファイルではその命名に合わせた正規表現へ更新する。
- 既存コードで命名規約に合わないファイル名が見つかった場合はリネームと import パス修正を同時に行い、規約の逸脱が再発しないようレビュー時にもチェックする。
