export type Depth = 'shallow' | 'normal' | 'normal_to_deep' | 'deep' | 'step_by_step' | 'wide';
export type Strictness = 'low' | 'normal' | 'medium' | 'medium_to_high' | 'high';
export type Proactivity = 'low' | 'normal' | 'high' | 'very_high';

export interface PersonalityPresetProps {
    id: string;
    displayName: string;
    description: string;
    tone: string;
    depth: Depth;
    strictness: Strictness;
    proactivity: Proactivity;
    systemPromptCore: string;
}

export class PersonalityPreset {
    readonly id: string;
    readonly displayName: string;
    readonly description: string;
    readonly tone: string;
    readonly depth: Depth;
    readonly strictness: Strictness;
    readonly proactivity: Proactivity;
    readonly systemPromptCore: string;

    constructor(raw: PersonalityPresetProps) {
        this.id = raw.id;
        this.displayName = raw.displayName;
        this.description = raw.description;
        this.tone = raw.tone;
        this.depth = raw.depth;
        this.strictness = raw.strictness;
        this.proactivity = raw.proactivity;
        this.systemPromptCore = raw.systemPromptCore;
    }

    static create(raw: PersonalityPresetProps): PersonalityPreset {
        return new PersonalityPreset(raw);
    }

    /**
     * プリセットIDが有効かどうかを検証する
     * @param id 検証対象のID
     * @param validIds 有効なIDのリスト
     * @throws Error IDが無効な場合
     */
    static validateId(id: string, validIds: string[]): void {
        if (!validIds.includes(id)) {
            throw new Error('Preset not found');
        }
    }
}
