import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

interface AuthRequest extends Request {
  user?: any;
}

interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware de autenticação JWT
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'Token de acesso não fornecido'
      });
      return;
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Token de acesso inválido'
      });
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
      
      // Adicionar usuário ao request
      req.user = {
        id: decoded.userId,
        email: decoded.email
      };

      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: 'Token expirado',
          code: 'TOKEN_EXPIRED'
        });
        return;
      }

      if (jwtError instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          message: 'Token inválido',
          code: 'INVALID_TOKEN'
        });
        return;
      }

      throw jwtError;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

/**
 * Middleware opcional de autenticação
 */
export const optionalAuthenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    next();
    return;
  }

  // Se tem token, verificar
  authenticate(req, res, next);
};

/**
 * Rate limiting para auth endpoints
 */
export const authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    
    // Limpar entradas expiradas
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
        code: 'TOO_MANY_ATTEMPTS'
      });
      return;
    }

    userAttempts.count++;
    next();
  };
};