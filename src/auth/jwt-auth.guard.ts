import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwksService } from './jwks.service';
import { createVerify } from 'crypto';

type JwtHeader = {
  alg: string;
  kid?: string;
  typ?: string;
};

type JwtPayload = {
  sub?: string;
  exp?: number;
  email?: string;
  role?: string;
  [key: string]: unknown;
};

const base64urlDecode = (input: string): Buffer => {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwksService: JwksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
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
    if (header.alg !== 'RS256') {
      throw new UnauthorizedException('Unsupported JWT alg');
    }
    if (!header.kid) {
      throw new UnauthorizedException('JWT kid is missing');
    }

    const payload = JSON.parse(
      base64urlDecode(encodedPayload).toString('utf8'),
    ) as JwtPayload;
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new UnauthorizedException('JWT expired');
    }

    const key = await this.jwksService.getKey(header.kid);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = base64urlDecode(encodedSignature);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signingInput);
    verifier.end();
    const valid = verifier.verify(key, signature);
    if (!valid) {
      throw new UnauthorizedException('JWT signature invalid');
    }

    request.user = payload;
    return true;
  }
}
