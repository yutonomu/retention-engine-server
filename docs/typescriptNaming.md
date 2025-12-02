## TypeScript ファイル命名規約

- `src/` 以下の TypeScript ファイルとディレクトリ名には **lowerCamelCase** を使用し、kebab-case（ハイフン区切り）は使わない。
- ファイル名は `lowerCamelCase` + `.` + `type` + `.ts` の形式とする。
  - 例: `personalityPreset.controller.ts`, `personalityPreset.service.ts`, `personalityPreset.module.ts`
- パイプ、ガード、リポジトリなど NestJS 固有のファイルでも `zodValidation.pipe.ts` のように lowerCamelCase を保つ。
- テストファイルも同様に lowerCamelCase を用い、Jest 等の設定ファイルではその命名に合わせた正規表現へ更新する。
- 既存コードで命名規約に合わないファイル名が見つかった場合はリネームと import パス修正を同時に行い、規約の逸脱が再発しないようレビュー時にもチェックする。

## ディレクトリ構造とアーキテクチャ規約

モジュール内のディレクトリ構造は以下のように構成する（`llm` モジュールや `personality-preset` モジュールを参考）。

```
src/module-name/
├── data/                  # JSONなどの静的データファイル
│   └── data.json
├── dto/                   # DTO定義 (Zodを使用)
│   └── response.dto.ts
├── repositories/          # リポジトリ関連
│   ├── feature.port.ts    # Port (インターフェース定義)
│   └── feature.repository.ts # Adapter (実装クラス)
├── feature.controller.ts  # Controller
├── feature.service.ts     # Service (Use Case)
├── feature.module.ts      # Module
└── feature.types.ts       # 型定義
```

### アーキテクチャ原則 (Port/Adapter パターン)

1.  **Service (Use Case)**:
    - サービスはユースケースとしての役割を持つ。
    - 具体的なデータアクセス実装には依存せず、**Port (リポジトリインターフェース)** に依存する。
    - インポート例: `import { FeatureRepository } from './repositories/feature.port';`

2.  **Repository (Port & Adapter)**:
    - **Port**: リポジトリの抽象インターフェース。ファイル名は `*.port.ts` とする。
    - **Adapter**: リポジトリの具象実装（DBアクセス、JSON読み込み等）。ファイル名は `*.repository.ts` とする。
    - 実装クラスは `repositories/` ディレクトリに配置する。

3.  **DTO (Data Transfer Object)**:
    - **Zod** を使用してスキーマと型を定義する。
    - クラスバリデーター (`class-validator`) ではなく Zod を推奨。

4.  **JSONデータの扱い**:
    - 静的なJSONデータは `data/` ディレクトリに配置する。
    - リポジトリの実装内で読み込み処理を行う。
