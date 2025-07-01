import { Request, Response } from 'express';
import bcryptjs from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: any;
}

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email e senha são obrigatórios'
        });
        return;
      }

      if (email.includes('@') && password.length >= 6) {
        // FIX: Cast explícito para resolver problema de tipos
        const token = (jwt as any).sign(
          { userId: 'demo-user', email },
          config.jwtSecret,
          { expiresIn: config.jwtExpiresIn }
        );

        res.status(200).json({
          success: true,
          data: {
            user: { 
              id: 'demo-user', 
              email, 
              name: 'Usuário Demo' 
            },
            token
          }
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'Credenciais inválidas'
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password || !name) {
        res.status(400).json({
          success: false,
          message: 'Email, senha e nome são obrigatórios'
        });
        return;
      }

      const hashedPassword = await bcryptjs.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name
        }
      });

      // FIX: Cast explícito para resolver problema de tipos
      const token = (jwt as any).sign(
        { userId: user.id, email: user.email },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
      );

      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name
          },
          token
        }
      });
    } catch (error: any) {
      console.error('Register error:', error);
      
      if (error.code === 'P2002') {
        res.status(409).json({
          success: false,
          message: 'Email já está em uso'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  static async verifyToken(req: AuthRequest, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
        valid: true
      }
    });
  }

  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: req.user
    });
  }
}