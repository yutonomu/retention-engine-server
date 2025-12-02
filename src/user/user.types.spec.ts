import { User } from './user.types';
import { VALID_MBTI_TYPES } from './mbti.types';

const baseProps = {
  user_id: 'user-001',
  role: 'NEW_HIRE' as const,
  display_name: 'Test User',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
} as const;

describe('User.create', () => {
  it('最小限の有効なフィールドとnullのMBTIでユーザーを作成できること', () => {
    const user = User.create({ ...baseProps, mbti: null });
    expect(user.user_id).toBe('user-001');
    expect(user.mbti).toBeNull();
    expect(user.created_at).toBeInstanceOf(Date);
  });

  it('全ての有効なMBTIタイプを受け入れること', () => {
    VALID_MBTI_TYPES.forEach((mbti) => {
      const user = User.create({
        ...baseProps,
        user_id: `user-${mbti}`,
        mbti,
      });
      expect(user.mbti).toBe(mbti);
    });
  });

  it('小文字のMBTIを大文字に正規化すること', () => {
    const user = User.create({
      ...baseProps,
      mbti: 'intp' as any,
    });
    expect(user.mbti).toBe('INTP');
  });

  it('無効なMBTIの場合エラーを投げること', () => {
    expect(() =>
      User.create({
        ...baseProps,
        mbti: 'ABCD' as any,
      }),
    ).toThrow(/Invalid MBTI type/);
  });

  it('user_idが欠けている場合エラーを投げること', () => {
    expect(() => User.create({ ...baseProps, user_id: '   ' })).toThrow(
      /user_id is required/,
    );
  });

  it('無効なcreated_atの場合エラーを投げること', () => {
    expect(() =>
      User.create({ ...baseProps, created_at: 'not-a-date' }),
    ).toThrow(/created_at must be a valid date/);
  });
});
