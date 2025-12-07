import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  UpdateAvatarSettingsSchema,
  type UpdateAvatarSettingsDto,
  type GetAvatarSettingsResponseDto,
  type GenerateAvatarResponseDto,
  type GetAvatarStatusResponseDto,
} from './dto/avatar.dto';
import type { JwtPayload } from '../auth/auth.types';

@Controller('avatar')
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Get('settings')
  @UseGuards(JwtAuthGuard)
  async getSettings(
    @Request() req: { user: JwtPayload },
  ): Promise<GetAvatarSettingsResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const { settings, avatarUrls } = await this.avatarService.getSettings(userId);

      return {
        userId,
        settings: settings
          ? {
              id: settings.id,
              gender: settings.gender,
              personalityPreset: settings.personalityPreset,
              isGenerated: settings.isGenerated,
              generationStatus: settings.generationStatus,
              generationProgress: settings.generationProgress,
            }
          : null,
        avatarUrls,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to fetch avatar settings: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('settings')
  @UseGuards(JwtAuthGuard)
  async updateSettings(
    @Request() req: { user: JwtPayload },
    @Body() body: unknown,
  ): Promise<GetAvatarSettingsResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    let validatedData: UpdateAvatarSettingsDto;
    try {
      validatedData = UpdateAvatarSettingsSchema.parse(body);
    } catch {
      throw new HttpException(
        'Invalid avatar settings. Check gender and personalityPreset values.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const settings = await this.avatarService.upsertSettings(
        userId,
        validatedData.gender,
        validatedData.personalityPreset,
      );

      return {
        userId,
        settings: {
          id: settings.id,
          gender: settings.gender,
          personalityPreset: settings.personalityPreset,
          isGenerated: settings.isGenerated,
          generationStatus: settings.generationStatus,
          generationProgress: settings.generationProgress,
        },
        avatarUrls: null,
      };
    } catch (error) {
      throw new HttpException(
        `Failed to update avatar settings: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async startGeneration(
    @Request() req: { user: JwtPayload },
  ): Promise<GenerateAvatarResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    try {
      await this.avatarService.startGeneration(userId);

      return {
        status: 'generating',
        message: 'Avatar generation started',
        estimatedTime: 60,
      };
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('not found')) {
        throw new HttpException(message, HttpStatus.NOT_FOUND);
      }

      if (message.includes('already in progress')) {
        throw new HttpException(message, HttpStatus.CONFLICT);
      }

      throw new HttpException(
        `Failed to start avatar generation: ${message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @Request() req: { user: JwtPayload },
  ): Promise<GetAvatarStatusResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const status = await this.avatarService.getStatus(userId);
      return status;
    } catch (error) {
      throw new HttpException(
        `Failed to fetch avatar status: ${(error as Error).message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
