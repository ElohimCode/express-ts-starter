import { Request, Response, NextFunction } from 'express';
import { ITokenService } from '../domain/token.service.interface.js';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/app-error.js';

export function createAuthMiddleware(tokenService: ITokenService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Missing or malformed Authorization header'));
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return next(new UnauthorizedError('Token is missing from Authorization header'));
    }

    try {
      const payload = tokenService.verifyAccessToken(token);
      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authorize(...allowedRoles: Array<'USER' | 'ADMIN'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `User with role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
}
