import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config/env';

interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
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
      const decoded = (jwt as any).verify(token, config.jwtSecret) as JWTPayload;
      
      (req as any).user = {
        id: decoded.userId,
        email: decoded.email
      };

      next();
    } catch (jwtError) {
      res.status(401).json({
        success: false,
        message: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
      return;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
};

export const authRateLimit = (maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const identifier = req.ip || 'unknown';
    const now = Date.now();
    
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
