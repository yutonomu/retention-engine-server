import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { SupabaseAdminClient } from '../supabase/adminClient';
import { User } from './user.types';
import type { MbtiType } from './mbti.types';
import { PersonalityPresetService } from '../personality-preset/personalityPreset.service';

describe('UserService MBTI機能', () => {
    let service: UserService;
    let mockSupabase: {
        from: jest.Mock;
        select: jest.Mock;
        eq: jest.Mock;
        maybeSingle: jest.Mock;
        upsert: jest.Mock;
    };
    let mockPersonalityPresetService: {
        getAll: jest.Mock;
        findById: jest.Mock;
    };

    const mockUser = {
        user_id: 'test-user-001',
        role: 'NEW_HIRE' as const,
        display_name: 'Test User',
        email: 'test@example.com',
        created_at: new Date('2024-01-01'),
        disabled_at: null,
        mbti: null as MbtiType | null,
    };

    beforeEach(async () => {
        // Create mock Supabase client
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            upsert: jest.fn(),
        };

        // Create mock PersonalityPresetService
        mockPersonalityPresetService = {
            getAll: jest.fn(),
            findById: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserService,
                {
                    provide: 'SUPABASE_ADMIN_CLIENT',
                    useValue: mockSupabase,
                },
                {
                    provide: PersonalityPresetService,
                    useValue: mockPersonalityPresetService,
                },
            ],
        }).compile();

        service = module.get<UserService>(UserService);
    });

    describe('getUserMbti', () => {
        it('ユーザーが存在しMBTIが設定されている場合、MBTIを返すこと', async () => {
            const userWithMbti = { ...mockUser, mbti: 'INTJ' as MbtiType };
            mockSupabase.maybeSingle.mockResolvedValue({
                data: userWithMbti,
                error: null,
            });

            const result = await service.getUserMbti('test-user-001');

            expect(result).toBe('INTJ');
            expect(mockSupabase.from).toHaveBeenCalledWith('user');
            expect(mockSupabase.select).toHaveBeenCalled();
            expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'test-user-001');
        });

        it('ユーザーは存在するがMBTIが未設定の場合、nullを返すこと', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: mockUser,
                error: null,
            });

            const result = await service.getUserMbti('test-user-001');

            expect(result).toBeNull();
        });

        it('ユーザーが存在しない場合、エラーを投げること', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });

            await expect(service.getUserMbti('non-existent-user')).rejects.toThrow(
                'User not found',
            );
        });

        it('データベースクエリが失敗した場合、エラーを投げること', async () => {
            const dbError = new Error('Database connection failed');
            mockSupabase.maybeSingle.mockResolvedValue({
                data: null,
                error: dbError,
            });

            await expect(service.getUserMbti('test-user-001')).rejects.toThrow(
                dbError,
            );
        });
    });

    describe('updateUserMbti', () => {
        beforeEach(() => {
            // Mock successful upsert by default
            mockSupabase.upsert.mockResolvedValue({
                data: null,
                error: null,
            });
        });

        it('既存ユーザーのMBTIを更新できること', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: mockUser,
                error: null,
            });

            await service.updateUserMbti('test-user-001', 'ENFP');

            expect(mockSupabase.from).toHaveBeenCalledWith('user');
            expect(mockSupabase.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 'test-user-001',
                    mbti: 'ENFP',
                }),
                { onConflict: 'user_id' },
            );
        });

        it('全16種類の有効なMBTIタイプを処理できること', async () => {
            const validTypes: MbtiType[] = [
                'INTJ',
                'INTP',
                'ENTJ',
                'ENTP',
                'INFJ',
                'INFP',
                'ENFJ',
                'ENFP',
                'ISTJ',
                'ISFJ',
                'ESTJ',
                'ESFJ',
                'ISTP',
                'ISFP',
                'ESTP',
                'ESFP',
            ];

            mockSupabase.maybeSingle.mockResolvedValue({
                data: mockUser,
                error: null,
            });

            for (const mbtiType of validTypes) {
                await service.updateUserMbti('test-user-001', mbtiType);

                expect(mockSupabase.upsert).toHaveBeenCalledWith(
                    expect.objectContaining({
                        mbti: mbtiType,
                    }),
                    { onConflict: 'user_id' },
                );
            }

            expect(mockSupabase.upsert).toHaveBeenCalledTimes(16);
        });

        it('ユーザーが存在しない場合、エラーを投げること', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: null,
                error: null,
            });

            await expect(
                service.updateUserMbti('non-existent-user', 'INTJ'),
            ).rejects.toThrow('User not found');
        });

        it('更新処理(upsert)が失敗した場合、エラーを投げること', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({
                data: mockUser,
                error: null,
            });

            const dbError = new Error('Upsert failed');
            mockSupabase.upsert.mockResolvedValue({
                data: null,
                error: dbError,
            });

            await expect(
                service.updateUserMbti('test-user-001', 'INTJ'),
            ).rejects.toThrow(dbError);
        });

        it('MBTI更新時に他のユーザーフィールドを維持すること', async () => {
            const existingUser = {
                ...mockUser,
                display_name: 'Original Name',
                email: 'original@example.com',
                mbti: 'ISTJ' as MbtiType,
            };

            mockSupabase.maybeSingle.mockResolvedValue({
                data: existingUser,
                error: null,
            });

            await service.updateUserMbti('test-user-001', 'ENFP');

            expect(mockSupabase.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    user_id: 'test-user-001',
                    display_name: 'Original Name',
                    email: 'original@example.com',
                    mbti: 'ENFP', // Updated value
                }),
                { onConflict: 'user_id' },
            );
        });
    });

    describe('MBTI値のバリデーション', () => {
        it('User.createを通じてMBTIを検証できること', () => {
            const validMbti: MbtiType = 'INTJ';
            const user = User.create({ ...mockUser, mbti: validMbti });
            expect(user.mbti).toBe('INTJ');
        });

        it('User.createを通じて無効なMBTIを拒否すること', () => {
            expect(() => {
                User.create({
                    ...mockUser,
                    mbti: 'INVALID' as any,
                });
            }).toThrow('Invalid MBTI type');
        });
    });
});
