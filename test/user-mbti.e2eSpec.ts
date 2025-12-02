import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { UserService } from '../src/user/user.service';
import { User } from '../src/user/user.types';

describe('MBTI Endpoints (e2e)', () => {
    let app: INestApplication<App>;
    let userService: UserService;

    // Mock JWT tokens
    const mockNewHireToken = 'mock-new-hire-token';
    const mockMentorToken = 'mock-mentor-token';
    const mockInvalidToken = 'invalid-token';

    const mockNewHireUser = User.create({
        user_id: '550e8400-e29b-41d4-a716-446655440001',
        role: 'NEW_HIRE',
        display_name: 'Test New Hire',
        email: 'newhire@example.com',
        created_at: new Date(),
        mbti: null,
    });

    const mockMentorUser = User.create({
        user_id: '550e8400-e29b-41d4-a716-446655440002',
        role: 'MENTOR',
        display_name: 'Test Mentor',
        email: 'mentor@example.com',
        created_at: new Date(),
        mbti: null,
    });

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        userService = moduleFixture.get<UserService>(UserService);

        // Setup test users
        await userService.upsertUser(mockNewHireUser);
        await userService.upsertUser(mockMentorUser);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /users/mbti', () => {
        it('should return 401 without authentication', () => {
            return request(app.getHttpServer())
                .get('/users/mbti')
                .expect(HttpStatus.UNAUTHORIZED);
        });

        it('should return 401 with invalid token', () => {
            return request(app.getHttpServer())
                .get('/users/mbti')
                .set('Authorization', `Bearer ${mockInvalidToken}`)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        // Note: The following tests would require proper JWT token generation
        // In a real environment, you would either:
        // 1. Mock the JwtAuthGuard
        // 2. Generate valid test tokens from your auth provider
        // 3. Use a test authentication setup

        it.skip('should return null when MBTI is not set', async () => {
            const response = await request(app.getHttpServer())
                .get('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ mbti: null });
        });

        it.skip('should return MBTI when it is set', async () => {
            // First set MBTI
            await userService.updateUserMbti('550e8400-e29b-41d4-a716-446655440001', 'INTJ');

            const response = await request(app.getHttpServer())
                .get('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ mbti: 'INTJ' });
        });
    });

    describe('PUT /users/mbti', () => {
        it('should return 401 without authentication', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .send({ mbti: 'INTJ' })
                .expect(HttpStatus.UNAUTHORIZED);
        });

        it('should return 401 with invalid token', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockInvalidToken}`)
                .send({ mbti: 'INTJ' })
                .expect(HttpStatus.UNAUTHORIZED);
        });

        it.skip('should return 403 for MENTOR role', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockMentorToken}`)
                .send({ mbti: 'INTJ' })
                .expect(HttpStatus.FORBIDDEN);
        });

        it.skip('should return 400 for invalid MBTI type', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .send({ mbti: 'INVALID' })
                .expect(HttpStatus.BAD_REQUEST)
                .expect((res) => {
                    expect(res.body.error).toContain('Invalid MBTI type');
                });
        });

        it.skip('should return 400 for lowercase MBTI', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .send({ mbti: 'intj' })
                .expect(HttpStatus.BAD_REQUEST);
        });

        it.skip('should return 400 for missing MBTI field', () => {
            return request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .send({})
                .expect(HttpStatus.BAD_REQUEST);
        });

        it.skip('should successfully update MBTI for NEW_HIRE', async () => {
            const response = await request(app.getHttpServer())
                .put('/users/mbti')
                .set('Authorization', `Bearer ${mockNewHireToken}`)
                .send({ mbti: 'ENFP' })
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({});

            // Verify the update
            const mbti = await userService.getUserMbti('550e8400-e29b-41d4-a716-446655440001');
            expect(mbti).toBe('ENFP');
        });

        it.skip('should allow multiple MBTI updates', async () => {
            const mbtiTypes = ['INTJ', 'ENFP', 'ISTP', 'ESFJ'];

            for (const mbtiType of mbtiTypes) {
                await request(app.getHttpServer())
                    .put('/users/mbti')
                    .set('Authorization', `Bearer ${mockNewHireToken}`)
                    .send({ mbti: mbtiType })
                    .expect(HttpStatus.OK);

                const currentMbti = await userService.getUserMbti('550e8400-e29b-41d4-a716-446655440001');
                expect(currentMbti).toBe(mbtiType);
            }
        });
    });

    describe('MBTI validation', () => {
        const validMbtiTypes = [
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

        it.skip('should accept all 16 valid MBTI types', async () => {
            for (const mbtiType of validMbtiTypes) {
                const response = await request(app.getHttpServer())
                    .put('/users/mbti')
                    .set('Authorization', `Bearer ${mockNewHireToken}`)
                    .send({ mbti: mbtiType })
                    .expect(HttpStatus.OK);

                expect(response.body).toEqual({});
            }
        });

        const invalidMbtiTypes = [
            'XXXX',
            'INT',
            'INTJJ',
            'abcd',
            '1234',
            '',
            'INTZ',
        ];

        it.skip('should reject invalid MBTI types', async () => {
            for (const invalidType of invalidMbtiTypes) {
                await request(app.getHttpServer())
                    .put('/users/mbti')
                    .set('Authorization', `Bearer ${mockNewHireToken}`)
                    .send({ mbti: invalidType })
                    .expect(HttpStatus.BAD_REQUEST);
            }
        });
    });

    describe('Integration with UserService', () => {
        it('should directly test UserService methods', async () => {
            // Test getUserMbti
            const initialMbti = await userService.getUserMbti('550e8400-e29b-41d4-a716-446655440001');
            expect(initialMbti).toBeNull();

            // Test updateUserMbti
            await userService.updateUserMbti('550e8400-e29b-41d4-a716-446655440001', 'INTJ');

            // Verify update
            const updatedMbti = await userService.getUserMbti('550e8400-e29b-41d4-a716-446655440001');
            expect(updatedMbti).toBe('INTJ');

            // Test update to different type
            await userService.updateUserMbti('550e8400-e29b-41d4-a716-446655440001', 'ENFP');
            const finalMbti = await userService.getUserMbti('550e8400-e29b-41d4-a716-446655440001');
            expect(finalMbti).toBe('ENFP');
        });

        it('should throw error for non-existent user', async () => {
            await expect(
                userService.getUserMbti('550e8400-e29b-41d4-a716-446655440003'),
            ).rejects.toThrow('User not found');

            await expect(
                userService.updateUserMbti('550e8400-e29b-41d4-a716-446655440003', 'INTJ'),
            ).rejects.toThrow('User not found');
        });
    });
});
