import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PersonalityPresetService } from '../src/personality-preset/personalityPreset.service';
import { toPersonalityPresetId } from '../src/personality-preset/personalityPreset.types';

describe('PersonalityPresetController (e2e)', () => {
    let app: INestApplication;
    let presetService: PersonalityPresetService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        presetService = moduleFixture.get<PersonalityPresetService>(PersonalityPresetService);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('GET /personality-presets', () => {
        // AuthGuard is currently disabled with TODO
        // it('認証なしで401を返すべき', () => {
        //   return request(app.getHttpServer())
        //     .get('/personality-presets')
        //     .expect(HttpStatus.UNAUTHORIZED);
        // });

        it('プリセットの一覧を返すべき', async () => {
            const response = await request(app.getHttpServer())
                .get('/personality-presets')
                // .set('Authorization', `Bearer ${ mockToken } `) // Auth disabled
                .expect(HttpStatus.OK);

            expect(response.body).toHaveProperty('presets');
            expect(Array.isArray(response.body.presets)).toBe(true);
            expect(response.body.presets.length).toBeGreaterThan(0);

            const firstPreset = response.body.presets[0];
            expect(firstPreset).toHaveProperty('id');
            expect(firstPreset).toHaveProperty('displayName');
            // Should NOT have internal fields
            expect(firstPreset).not.toHaveProperty('systemPromptCore');
        });
    });

    describe('PersonalityPresetService', () => {
        it('リポジトリ経由でJSONからプリセットをロードすべき', () => {
            const presets = presetService.getAll();
            expect(presets.length).toBeGreaterThan(0);
            expect(presets.find(p => p.id === 'default_assistant')).toBeDefined();
        });

        it('IDでプリセットを検索できるべき', () => {
            const preset = presetService.findById(toPersonalityPresetId('kind_mentor'));
            expect(preset).toBeDefined();
            expect(preset?.displayName).toBe('やさしいメンター');
        });
    });
});
