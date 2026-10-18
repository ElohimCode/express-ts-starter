import { Request, Response, NextFunction } from 'express';
import { UserService } from '../application/user.service.js';
import { ApiResponse } from '../../../shared/types/index.js';
import { UserProfile } from '../domain/user.entity.js';
import { UnauthorizedError, ForbiddenError } from '../../../shared/errors/app-error.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError();
      }

      const profile = await this.userService.getProfile(req.user.id);
      const response: ApiResponse<UserProfile> = {
        data: profile,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError();
      }

      // Strictly allowed fields only (mass assignment protection)
      const { firstName, lastName } = req.body;
      const updated = await this.userService.updateProfile(req.user.id, {
        firstName,
        lastName,
      });

      const response: ApiResponse<UserProfile> = {
        data: updated,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      const result = await this.userService.listUsers({ page, limit });

      const response: ApiResponse<UserProfile[]> = {
        data: result.items,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = req.params.id as string;

      // Allow if admin or requesting own profile
      if (req.user?.role !== 'ADMIN' && req.user?.id !== targetId) {
        throw new ForbiddenError('You can only view your own user profile');
      }

      const profile = await this.userService.getUserById(targetId);
      const response: ApiResponse<UserProfile> = {
        data: profile,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  };
}
