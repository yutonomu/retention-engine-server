import { PersonalityPreset, type PersonalityPresetId } from '../personalityPreset.types';

export const PERSONALITY_PRESET_REPOSITORY = 'PERSONALITY_PRESET_REPOSITORY';

export interface PersonalityPresetRepository {
    findAll(): PersonalityPreset[];
    findById(id: PersonalityPresetId): PersonalityPreset | undefined;
}
