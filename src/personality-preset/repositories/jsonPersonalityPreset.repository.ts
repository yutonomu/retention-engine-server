import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PersonalityPresetRepository } from './personalityPreset.port';
import { PersonalityPreset, PersonalityPresetProps } from '../personalityPreset.types';

@Injectable()
export class JsonPersonalityPresetRepository implements PersonalityPresetRepository, OnModuleInit {
    private readonly logger = new Logger(JsonPersonalityPresetRepository.name);
    private presets: PersonalityPreset[] = [];

    onModuleInit() {
        this.loadPresets();
    }

    private loadPresets() {
        try {
            // プリセットJSONファイルのパス解決
            // src/personality-preset/data/presets.json を想定
            const filePath = path.join(__dirname, '..', 'data', 'presets.json');

            // ファイルが存在しない場合のフォールバック（開発環境などでパスが異なる場合）
            if (!fs.existsSync(filePath)) {
                const srcPath = path.join(process.cwd(), 'src', 'personality-preset', 'data', 'presets.json');
                if (fs.existsSync(srcPath)) {
                    const fileContent = fs.readFileSync(srcPath, 'utf-8');
                    const rawPresets: PersonalityPresetProps[] = JSON.parse(fileContent);
                    this.presets = rawPresets.map(raw => PersonalityPreset.create(raw));
                    this.logger.log(`Loaded ${this.presets.length} personality presets from ${srcPath}`);
                    return;
                }
                this.logger.error(`Presets file not found at ${filePath} or ${srcPath}`);
                return;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const rawPresets: PersonalityPresetProps[] = JSON.parse(fileContent);
            this.presets = rawPresets.map(raw => PersonalityPreset.create(raw));
            this.logger.log(`Loaded ${this.presets.length} personality presets from ${filePath}`);
        } catch (error) {
            this.logger.error('Failed to load personality presets', error);
            this.presets = [];
        }
    }

    findAll(): PersonalityPreset[] {
        return [...this.presets];
    }

    findById(id: string): PersonalityPreset | undefined {
        return this.presets.find(p => p.id === id);
    }

}
