import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../types';

const prisma = new PrismaClient();

interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication middleware that verifies JWT tokens
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'Token de acesso não fornecido',
      });
      return;
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Token de acesso inválido',
      });
      return;
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Verify user still exists in database
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Usuário não encontrado',
        });
        return;
      }

      // Add user to request object
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
      };

      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: 'Token expirado',
          code: 'TOKEN_EXPIRED',
        });
        return;
      }

      if (jwtError instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          message: 'Token inválido',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      throw jwtError;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    next();
    return;
  }

  // If token is present, verify it
  await authenticate(req, res, next);
};

/**
 * Middleware to ensure user has completed onboarding
 */
export const requireOnboarding = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Usuário não autenticado',
      });
      return;
    }

    // Check if user has at least one payer (minimum requirement for onboarding)
    const payerCount = await prisma.payer.count({
      where: { userId, active: true },
    });

    if (payerCount === 0) {
      res.status(403).json({
        success: false,
        message: 'Onboarding incompleto. É necessário criar pelo menos um pagador.',
        code: 'ONBOARDING_INCOMPLETE',
        redirect: '/onboarding',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Require onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
    });
  }
};

/**
 * JWT token utilities
 */
export class JWTUtils {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
  private static readonly REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

  /**
   * Generate access token
   */
  static generateAccessToken(user: { id: string; email: string; name: string }): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      this.JWT_SECRET,
      {
        expiresIn: this.JWT_EXPIRES_IN,
        issuer: 'partilio-api',
        audience: 'partilio-app',
      }
    );
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user: { id: string; email: string; name: string }): string {
    return jwt.sign(
      { 
        userId: user.id,
        type: 'refresh'
      },
      this.JWT_SECRET,
      {
        expiresIn: this.REFRESH_TOKEN_EXPIRES_IN,
        issuer: 'partilio-api',
        audience: 'partilio-app',
      }
    );
  }

  /**
   * Verify token
   */
  static verifyToken(token: string): JWTPayload {
    return jwt.verify(token, this.JWT_SECRET) as JWTPayload;
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return true;
      
      return Date.now() >= decoded.exp * 1000;
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration date
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) return null;
      
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }

  /**
   * Generate tokens for user
   */
  static generateTokens(user: { id: string; email: string; name: string }): {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    const expiresAt = this.getTokenExpiration(accessToken) || new Date();

    return {
      accessToken,
      refreshToken,
      expiresAt,
    };
  }
}

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (
  maxAttempts: number = 5,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    for (const [key, value] of attempts.entries()) {
      if (now > value.resetTime) {
        attempts.delete(key);
      }
    }

    const userAttempts = attempts.get(identifier);
    
    if (!userAttempts) {
      attempts.set(identifier, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (userAttempts.count >= maxAttempts) {
      const timeLeft = Math.ceil((userAttempts.resetTime - now) / 1000 / 60);
      res.status(429).json({
        success: false,
        message: `Muitas tentativas. Tente novamente em ${timeLeft} minutos.`,
        code: 'TOO_MANY_ATTEMPTS',
        retryAfter: userAttempts.resetTime,
      });
      return;
    }

    userAttempts.count++;
    next();
  };
};

/**
 * Middleware to validate user ownership of resources
 */
export const validateOwnership = (resourceType: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.id;
      const resourceId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        });
        return;
      }

      if (!resourceId) {
        res.status(400).json({
          success: false,
          message: 'ID do recurso não fornecido',
        });
        return;
      }

      let resource;
      
      switch (resourceType) {
        case 'expense':
          resource = await prisma.expense.findFirst({
            where: { id: resourceId, userId },
            select: { id: true },
          });
          break;
        
        case 'category':
          resource = await prisma.category.findFirst({
            where: { id: resourceId, userId },
            select: { id: true },
          });
          break;
        
        case 'creditCard':
          resource = await prisma.creditCard.findFirst({
            where: { id: resourceId, userId },
            select: { id: true },
          });
          break;
        
        case 'payer':
          resource = await prisma.payer.findFirst({
            where: { id: resourceId, userId },
            select: { id: true },
          });
          break;
        
        default:
          res.status(400).json({
            success: false,
            message: 'Tipo de recurso não suportado',
          });
          return;
      }

      if (!resource) {
        res.status(404).json({
          success: false,
          message: 'Recurso não encontrado ou acesso negado',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Validate ownership error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  };
};