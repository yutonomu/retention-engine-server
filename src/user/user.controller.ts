import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  updateMbtiSchema,
  type UpdateMbtiDto,
} from './dto/updateMbti.dto';
import type { GetUserMbtiResponseDto } from './dto/getUserMbtiResponse.dto';
import {
  UpdatePersonalityPresetSchema,
  type UpdatePersonalityPresetDto,
} from './dto/updatePersonalityPreset.dto';
import type { GetPersonalityPresetResponseDto } from './dto/getPersonalityPresetResponse.dto';
import type { JwtPayload } from '../auth/auth.types';
import { toPersonalityPresetId } from '../personality-preset/personalityPreset.types';



@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('mbti')
  @UseGuards(JwtAuthGuard)
  async getMbti(
    @Request() req: { user: JwtPayload },
  ): Promise<GetUserMbtiResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const mbti = await this.userService.getUserMbti(userId);
      return { mbti };
    } catch (error) {
      if ((error as Error).message === 'User not found') {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to fetch MBTI.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('mbti')
  @UseGuards(JwtAuthGuard)
  async updateMbti(
    @Request() req: { user: JwtPayload },
    @Body() body: unknown,
  ): Promise<void> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }
    // const userRole = req.user.role; 

    // if (userRole !== 'NEW_HIRE') {
    //   throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    // }

    let validatedData: UpdateMbtiDto;
    try {
      validatedData = updateMbtiSchema.parse(body);
    } catch (error) {
      throw new HttpException(
        'Invalid MBTI type. Must be one of 16 valid types.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.userService.updateUserMbti(userId, validatedData.mbti);
    } catch (error) {
      if ((error as Error).message === 'User not found') {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to update MBTI.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('personality-preset')
  @UseGuards(JwtAuthGuard)
  async getUserPersonalityPreset(
    @Request() req: { user: JwtPayload },
  ): Promise<GetPersonalityPresetResponseDto> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    try {
      const presetId = await this.userService.getUserPersonalityPreset(userId);
      return { presetId };
    } catch (error) {
      if ((error as Error).message === 'User not found') {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Failed to fetch personality preset.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('personality-preset')
  @UseGuards(JwtAuthGuard)
  async updateUserPersonalityPreset(
    @Request() req: { user: JwtPayload },
    @Body() body: unknown,
  ): Promise<void> {
    const userId = req.user.sub;
    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

    let validatedData: UpdatePersonalityPresetDto;
    try {
      validatedData = UpdatePersonalityPresetSchema.parse(body);
    } catch (error) {
      throw new HttpException(
        'Invalid preset ID.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      // string | null を PersonalityPresetId | null に変換
      const presetId = validatedData.presetId !== null
        ? toPersonalityPresetId(validatedData.presetId)
        : null;
      await this.userService.updateUserPersonalityPreset(userId, presetId);
    } catch (error) {
      if ((error as Error).message === 'User not found') {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      if ((error as Error).message === 'Preset not found') {
        throw new HttpException('Preset not found', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(
        'Failed to update personality preset.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
