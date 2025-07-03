import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema de validação para registro
const registerSchema = z.object({
  name: z.string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras e espaços'),
  email: z.string()
    .email('Email inválido')
    .toLowerCase(),
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/\d/, 'Senha deve conter pelo menos um número'),
});

class AuthController {
  
  // ✅ MÉTODO EXISTENTE - Login (manter como está)
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      // Validação básica
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email e senha são obrigatórios'
        });
      }

      // Por enquanto, aceitar qualquer credencial para demo
      if (email && password) {
        const demoUser = {
          id: 'demo-user',
          email: email,
          name: 'Usuário Demo'
        };

        const token = jwt.sign(
          { userId: demoUser.id, email: demoUser.email },
          process.env.JWT_SECRET || 'fallback-secret',
          { expiresIn: '24h' }
        );

        return res.json({
          success: true,
          data: {
            user: demoUser,
            token: token
          }
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });

    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // 🆕 NOVO MÉTODO - Register
  static async register(req: Request, res: Response) {
    try {
      console.log('📝 Register attempt:', { body: req.body });

      // 1. Validar dados de entrada
      const validationResult = registerSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors: Record<string, string> = {};
        validationResult.error.errors.forEach(error => {
          if (error.path[0]) {
            errors[error.path[0] as string] = error.message;
          }
        });

        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors
        });
      }

      const { name, email, password } = validationResult.data;

      // 2. Verificar se email já existe (simulado por enquanto)
      // TODO: Implementar verificação real no banco quando Prisma estiver configurado
      const existingUsers = ['admin@test.com', 'demo@test.com']; // Lista simulada
      
      if (existingUsers.includes(email)) {
        return res.status(409).json({
          success: false,
          message: 'Este email já está cadastrado',
          code: 'EMAIL_EXISTS'
        });
      }

      // 3. Hash da senha
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // 4. Criar usuário (simulado por enquanto)
      // TODO: Salvar no banco quando Prisma estiver configurado
      const newUser = {
        id: `user_${Date.now()}`, // ID temporário
        name: name.trim(),
        email: email,
        createdAt: new Date().toISOString(),
        onboardingCompleted: false
      };

      console.log('✅ User created (simulated):', { 
        id: newUser.id, 
        email: newUser.email, 
        name: newUser.name 
      });

      // 5. Gerar JWT token
      const token = jwt.sign(
        { 
          userId: newUser.id, 
          email: newUser.email 
        },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '24h' }
      );

      // 6. Resposta de sucesso (sem senha)
      const userResponse = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        createdAt: newUser.createdAt,
        onboardingCompleted: newUser.onboardingCompleted
      };

      return res.status(201).json({
        success: true,
        data: {
          user: userResponse,
          token: token,
          // Formato compatível com frontend atual
          tokens: {
            accessToken: token,
            refreshToken: token // Por enquanto usar o mesmo token
          }
        },
        message: 'Usuário criado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro no registro:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // ✅ MÉTODOS EXISTENTES (manter como estão)
  static async getProfile(req: Request, res: Response) {
    try {
      // Implementação existente para profile
      const user = {
        id: 'demo-user',
        email: 'test@test.com',
        name: 'Usuário Demo'
      };

      return res.json({
        success: true,
        data: user
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Erro ao buscar perfil'
      });
    }
  }

  static async verifyToken(req: Request, res: Response) {
    // Implementação existente
    return res.json({
      success: true,
      data: { valid: true }
    });
  }

  static async logout(req: Request, res: Response) {
    // Implementação existente
    return res.json({
      success: true,
      message: 'Logout realizado com sucesso'
    });
  }

}

export default AuthController;