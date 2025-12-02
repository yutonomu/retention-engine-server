import { Injectable, Inject } from '@nestjs/common';
import { PersonalityPreset, type PersonalityPresetId } from './personalityPreset.types';
import { PERSONALITY_PRESET_REPOSITORY } from './repositories/personalityPreset.port';
import type { PersonalityPresetRepository } from './repositories/personalityPreset.port';

@Injectable()
export class PersonalityPresetService {
    constructor(
        @Inject(PERSONALITY_PRESET_REPOSITORY)
        private readonly repository: PersonalityPresetRepository,
    ) { }

    /**
     * 全プリセットを取得
     */
    getAll(): PersonalityPreset[] {
        return this.repository.findAll();
    }

    /**
     * ID指定でプリセットを取得
     */
    findById(id: PersonalityPresetId): PersonalityPreset | undefined {
        return this.repository.findById(id);
    }

}
