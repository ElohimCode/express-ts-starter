import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../application/auth.service.js';
import { ApiResponse } from '../../../shared/types/index.js';
import { UnauthorizedError } from '../../../shared/errors/app-error.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await this.authService.register({
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

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await this.authService.login({
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

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const tokens = await this.authService.refreshTokens(refreshToken, userAgent, ipAddress);

      const response: ApiResponse<typeof tokens> = {
        data: tokens,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      await this.authService.logout(refreshToken);

      res.status(200).json({
        data: { message: 'Logged out successfully' },
      });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError();
      }

      const user = await this.authService.getCurrentUser(req.user.id);

      const response: ApiResponse<typeof user> = {
        data: user,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };
}
