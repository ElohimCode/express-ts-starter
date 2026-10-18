import { RequestHandler } from 'express';
import { AuthService } from '../application/auth.service.js';
import { ApiResponse } from '../../../shared/types/index.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export interface AuthController {
  register: RequestHandler;
  login: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

export function createAuthController(authService: AuthService): AuthController {
  const register: RequestHandler = async (req, res, next) => {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.register({
        ...req.body,
        userAgent,
        ipAddress,
      });

      const response: ApiResponse<typeof result> = {
        data: result,
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  };

  const login: RequestHandler = async (req, res, next) => {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login({
        ...req.body,
        userAgent,
        ipAddress,
      });

      const response: ApiResponse<typeof result> = {
        data: result,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  const refresh: RequestHandler = async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const tokens = await authService.refreshTokens(refreshToken, userAgent, ipAddress);

      const response: ApiResponse<typeof tokens> = {
        data: tokens,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  const logout: RequestHandler = async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      await authService.logout(refreshToken);

      res.status(200).json({
        data: { message: 'Logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  };

  const me: RequestHandler = async (req, res, next) => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError();
      }

      const user = await authService.getCurrentUser(req.user.id);

      const response: ApiResponse<typeof user> = {
        data: user,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  return {
    register,
    login,
    refresh,
    logout,
    me,
  };
}
