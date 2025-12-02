import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PersonalityPresetController } from './personalityPreset.controller';
import { PersonalityPresetService } from './personalityPreset.service';
import { JsonPersonalityPresetRepository } from './repositories/jsonPersonalityPreset.repository';
import { PERSONALITY_PRESET_REPOSITORY } from './repositories/personalityPreset.port';

@Module({
    imports: [AuthModule],
    controllers: [PersonalityPresetController],
    providers: [
        PersonalityPresetService,
        {
            provide: PERSONALITY_PRESET_REPOSITORY,
            useClass: JsonPersonalityPresetRepository,
        },
    ],
    exports: [PersonalityPresetService],
})
export class PersonalityPresetModule { }
