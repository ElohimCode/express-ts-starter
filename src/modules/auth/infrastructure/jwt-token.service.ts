import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { ITokenService, AccessTokenPayload } from '../domain/token.service.interface.js';
import { env } from '../../../config/env.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export class JwtTokenService implements ITokenService {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
      },
      env.JWT_ACCESS_SECRET,
      {
        expiresIn: env.JWT_ACCESS_EXPIRATION as jwt.SignOptions['expiresIn'],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithm: 'HS256',
      }
    );
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;

      if (!decoded.sub || !decoded.email || !decoded.role) {
        throw new UnauthorizedError('Invalid token claims');
      }

      return {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role as 'USER' | 'ADMIN',
      };
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
  }

  generateRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshTokenExpiryDate(): Date {
    const days = env.JWT_REFRESH_EXPIRATION_DAYS;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
