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
import type { JwtPayload } from '../auth/auth.types';



@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get('mbti')
  // TODO: 認証を一時的に無効化しています。本番環境投入前に必ず @UseGuards(JwtAuthGuard) を戻してください。
  // @UseGuards(JwtAuthGuard)
  async getMbti(
    @Request() req: { user?: JwtPayload; query: { userId?: string } },
  ): Promise<GetUserMbtiResponseDto> {
    // 認証が無効な場合、クエリパラメータからuserIdを取得できるようにフォールバック
    const userId = req.user?.sub ?? req.query.userId;
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
  // TODO: 認証を一時的に無効化しています。本番環境投入前に必ず @UseGuards(JwtAuthGuard) を戻してください。
  // @UseGuards(JwtAuthGuard)
  async updateMbti(
    @Request() req: { user?: JwtPayload; body: { userId?: string } },
    @Body() body: unknown,
  ): Promise<void> {
    // 認証が無効な場合、リクエストボディからuserIdを取得できるようにフォールバック
    const userId = req.user?.sub ?? (body as { userId?: string }).userId;
    // const userRole = req.user?.role; // 認証無効時はロールチェックもスキップ

    if (!userId) {
      throw new HttpException('Unauthorized: userId is required', HttpStatus.UNAUTHORIZED);
    }

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
}
