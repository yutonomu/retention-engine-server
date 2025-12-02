import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserService } from '../src/user/user.service';
import { User } from '../src/user/user.types';

import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';

describe('UserPersonalityPreset (e2e)', () => {
    let app: INestApplication;
    let userService: UserService;

    // Mock user ID for testing
    const testUserId = '550e8400-e29b-41d4-a716-446655440001';

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({
                canActivate: (context: ExecutionContext) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { sub: testUserId, role: 'NEW_HIRE' };
                    return true;
                },
            })
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        userService = moduleFixture.get<UserService>(UserService);

        // Setup test user
        const mockUser = User.create({
            user_id: testUserId,
            role: 'NEW_HIRE',
            display_name: 'Test User',
            email: 'test@example.com',
            created_at: new Date(),
            mbti: null,
            personalityPresetId: null,
        });
        await userService.upsertUser(mockUser);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /users/personality-preset', () => {
        it('プリセットが設定されていない場合、nullを返すべき', async () => {
            const response = await request(app.getHttpServer())
                .get('/users/personality-preset')
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ presetId: null });
        });
    });

    describe('PUT /users/personality-preset', () => {
        it('プリセットを正常に更新できるべき', async () => {
            const presetId = 'kind_mentor'; // Assuming this ID exists in presets.json

            await request(app.getHttpServer())
                .put('/users/personality-preset')
                .send({ presetId })
                .expect(HttpStatus.OK);

            // Verify update via GET
            const response = await request(app.getHttpServer())
                .get('/users/personality-preset')
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ presetId });
        });

        it('無効なプリセットIDを拒否すべき', async () => {
            const invalidId = 'invalid_preset_id';

            await request(app.getHttpServer())
                .put('/users/personality-preset')
                .send({ presetId: invalidId })
                .expect(HttpStatus.BAD_REQUEST);
        });

        it('null設定（プリセット解除）を許可すべき', async () => {
            await request(app.getHttpServer())
                .put('/users/personality-preset')
                .send({ presetId: null })
                .expect(HttpStatus.OK);

            const response = await request(app.getHttpServer())
                .get('/users/personality-preset')
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ presetId: null });
        });
    });
});
