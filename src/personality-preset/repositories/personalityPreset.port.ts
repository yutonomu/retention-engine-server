import { PersonalityPreset } from '../personalityPreset.types';

export const PERSONALITY_PRESET_REPOSITORY = 'PERSONALITY_PRESET_REPOSITORY';

export interface PersonalityPresetRepository {
    findAll(): PersonalityPreset[];
    findById(id: string): PersonalityPreset | undefined;
}
