import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

import type { JwtPayload } from './auth.types';

type JwtHeader = {
  alg: string;
  typ?: string;
};

const base64urlDecode = (input: string): Buffer =>
  Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const token = authHeader.slice(7).trim();
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedException('Invalid JWT format');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = JSON.parse(
      base64urlDecode(encodedHeader).toString('utf8'),
    ) as JwtHeader;

    if (header.alg !== 'HS256') {
      throw new UnauthorizedException('Unsupported JWT alg');
    }

    const payload = JSON.parse(
      base64urlDecode(encodedPayload).toString('utf8'),
    ) as JwtPayload & { exp?: number };

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new UnauthorizedException('JWT expired');
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException(
        'SUPABASE_JWT_SECRET is not configured for HS256 verification',
      );
    }

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = base64urlDecode(encodedSignature);
    const expected = createHmac('sha256', secret).update(signingInput).digest();

    if (
      expected.length !== signature.length ||
      !timingSafeEqual(expected, signature)
    ) {
      throw new UnauthorizedException('JWT signature invalid');
    }

    request.user = payload;
    return true;
  }
}
