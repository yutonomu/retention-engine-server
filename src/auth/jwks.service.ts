import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createPublicKey, KeyObject } from 'crypto';

type Jwk = {
  kid: string;
  kty: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
};

type JwksResponse = {
  keys: Jwk[];
};

@Injectable()
export class JwksService {
  private cache = new Map<
    string,
    {
      key: KeyObject;
      expiresAt: number;
    }
  >();

  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes

  async getKey(kid: string): Promise<KeyObject> {
    const now = Date.now();
    const cached = this.cache.get(kid);
    if (cached && cached.expiresAt > now) {
      return cached.key;
    }

    const jwksUrl = process.env.SUPABASE_JWKS_URL;
    if (!jwksUrl) {
      throw new InternalServerErrorException('SUPABASE_JWKS_URL is not set');
    }

    const res = await fetch(jwksUrl);
    if (!res.ok) {
      throw new InternalServerErrorException(
        `Failed to fetch JWKS: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as JwksResponse;
    const target = body.keys.find((k) => k.kid === kid);
    if (!target) {
      throw new InternalServerErrorException(`JWKS kid ${kid} not found`);
    }

    const key = this.toKeyObject(target);
    this.cache.set(kid, { key, expiresAt: now + this.ttlMs });
    return key;
  }

  private toKeyObject(jwk: Jwk): KeyObject {
    try {
      return createPublicKey({ key: jwk, format: 'jwk' });
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to build public key for kid ${jwk.kid}: ${String(err)}`,
      );
    }
  }
}
