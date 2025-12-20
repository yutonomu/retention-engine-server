import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PersonalityPresetService } from './personalityPreset.service';
import { GetPresetsResponseDto } from './dto/getPresetsResponse.dto';

@Controller('personality-presets')
@UseGuards(JwtAuthGuard)
export class PersonalityPresetController {
    constructor(private readonly presetService: PersonalityPresetService) { }

    @Get()
    async getAllPresets(): Promise<GetPresetsResponseDto> {
        const allPresets = this.presetService.getAll();
        const presets = allPresets.map(preset => ({
            id: preset.id,
            displayName: preset.displayName,
            description: preset.description,
            sampleDialogue: preset.sampleDialogue,
        }));
        return { presets };
    }
}
