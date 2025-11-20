あなたはこのリポジトリの TypeScript コード規約を厳密に守るアシスタントです。
特に「UUID の扱い方」に関する以下のルールを絶対に遵守してください。

# 1. UUID 型の扱い方（branded type）

- TypeScript には組み込みの UUID 型は存在しないため、「UUID は string だが通常の string と区別したい」という前提で設計すること。
- UUID は必ず branded type として表現すること。

次の定義を標準として採用する:

```ts
export type UUID = string & { readonly __brand: unique symbol };

	•	「UUID を表す型が必要なとき」は、必ず string ではなく UUID を使うこと。
	•	id, messageId, conversationId, userId など「DB の主キー / エンティティ ID」に相当するものは基本的に UUID 型とする。

2. UUID の生成（uuidv7 を使用）
	•	UUID の生成には uuid ライブラリの v7 を使うこと。
	•	v4 ではなく v7 をデフォルトとする（時系列ソート・インデックス観点から）。

インポート例:

import { v7 as uuidv7 } from 'uuid';

UUID を返すユーティリティを用意し、直接 uuidv7() をあちこちで呼ばない:

export function createUUID(): UUID {
  return uuidv7() as UUID;
}

	•	新しい ID を生成するときは必ず createUUID() を経由するコードを書くこと。
	•	messageId: uuidv7; のように「関数を型として使う」誤ったコードは絶対に生成しないこと。

3. Zod による UUID バリデーション
	•	外部入力（HTTP リクエスト、DB からの生値など）を UUID として扱うときは、必ず Zod でバリデーションすること。
	•	その際、Zod では z.string().uuid() で形式チェックを行い、.transform で UUID 型に変換する。

標準スキーマ:

import { z } from 'zod';
import type { UUID } from './uuid'; // パスは適宜調整

export const UUIDSchema = z.string().uuid().transform(v => v as UUID);

	•	スキーマ定義では可能な限り UUIDSchema を再利用し、直接 z.string().uuid() を毎回書かないこと。
	•	エンティティや DTO の Zod スキーマを定義するときは、次のように書くこと:

export const MessageSchema = z.object({
  messageId: UUIDSchema,
  conversationId: UUIDSchema,
  userRole: z.enum(['NEW_HIRE', 'ASSISTANT']),
  content: z.string(),
  createdAt: z.coerce.date(),
});

export type Message = z.infer<typeof MessageSchema>;

4. エンティティ定義のルール
	•	TypeScript のインターフェースや型エイリアスを定義する際、UUID を含むフィールドは必ず UUID を使う。

例:

export type UserRole = 'NEW_HIRE' | 'ASSISTANT';

export interface Message {
  messageId: UUID;
  conversationId: UUID;
  userRole: UserRole;
  content: string;
  createdAt: Date;
}

	•	string と UUID を混在させない。ID 系のフィールドが string になっていたら、積極的に UUID にリファクタする提案を行うこと。

5. 守るべき禁止事項

次のようなコードは生成してはいけない:
	•	messageId: string; など、UUID を表すのにプレーンな string 型を使うこと
	•	messageId: ZodUUID; のように「Zod スキーマを型として使う」こと
	•	messageId: uuidv7; のように「UUID 生成関数を型として使う」こと
	•	Zod を使う場面で、毎回 z.string().uuid() を生で書き、UUID 型とのつながりを作らないこと

6. このルールの適用範囲
	•	新規ファイルや新規エンティティ・DTO・リクエスト型を定義する場合
	•	既存コードを修正・提案する場合
	•	「UUID 型どうする？」という文脈の質問があった場合は、必ず上記の方針（branded type + uuidv7 + Zod transform）に従って回答・コード生成を行うこと。

常に上記ポリシーを最優先し、TypeScript コード生成・リファクタリング・レビューの際に徹底して反映してください。

---

## 次のステップ  

- `.codex/` 内の「スタイルガイド」や「system」的なファイルに、上のテキストをそのまま貼る  
- UUID 周りのコードを今後書くときは、Codex にもこのルールを前提にさせる  
- 必要なら「DB 側の型(PostgreSQL の `uuid` カラムなど)」用のガイドも追記するとさらによくなるよ💡  

他にも「日付は基本 `Date` ではなく `Dayjs` で扱う」みたいなポリシーもまとめたいなら、その分も一緒に書き足す形で整理しようか？