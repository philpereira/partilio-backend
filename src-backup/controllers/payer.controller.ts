import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse, CreatePayerRequest, PayerData } from '../types';
import { schemas } from '../schemas';

const prisma = new PrismaClient();

/**
 * Payer Controller
 */
export class PayerController {
  /**
   * Get all payers for authenticated user
   */
  static async getAll(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const payers = await prisma.payer.findMany({
        where: { userId },
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.json({
        success: true,
        data: payers,
      } as ApiResponse);
    } catch (error) {
      console.error('Get payers error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get payer by ID
   */
  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const payerId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const payer = await prisma.payer.findFirst({
        where: { id: payerId, userId },
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
          creditCards: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              holder: true,
              closingDay: true,
              dueDay: true,
              limit: true,
            },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!payer) {
        res.status(404).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: payer,
      } as ApiResponse);
    } catch (error) {
      console.error('Get payer by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Create new payer
   */
  static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.payer.create.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      const payerData: CreatePayerRequest = validation.data;

      // Check if payer name already exists for this user
      const existingPayer = await prisma.payer.findFirst({
        where: {
          userId,
          name: {
            equals: payerData.name,
            mode: 'insensitive',
          },
        },
      });

      if (existingPayer) {
        res.status(409).json({
          success: false,
          message: 'Já existe um pagador com este nome',
        } as ApiResponse);
        return;
      }

      // Create payer
      const payer = await prisma.payer.create({
        data: {
          name: payerData.name,
          color: payerData.color,
          userId,
        },
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Pagador criado com sucesso',
        data: payer,
      } as ApiResponse);
    } catch (error) {
      console.error('Create payer error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update payer
   */
  static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const payerId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.payer.update.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      const updateData = validation.data;

      // If updating name, check for duplicates
      if (updateData.name) {
        const existingPayer = await prisma.payer.findFirst({
          where: {
            userId,
            name: {
              equals: updateData.name,
              mode: 'insensitive',
            },
            NOT: { id: payerId },
          },
        });

        if (existingPayer) {
          res.status(409).json({
            success: false,
            message: 'Já existe um pagador com este nome',
          } as ApiResponse);
          return;
        }
      }

      // Update payer
      const payer = await prisma.payer.update({
        where: { id: payerId },
        data: updateData,
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Pagador atualizado com sucesso',
        data: payer,
      } as ApiResponse);
    } catch (error) {
      console.error('Update payer error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Delete payer (soft delete by setting active to false)
   */
  static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const payerId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if payer exists and belongs to user
      const payer = await prisma.payer.findFirst({
        where: { id: payerId, userId },
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
        },
      });

      if (!payer) {
        res.status(404).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      // Check if payer has active dependencies
      const hasActiveDependencies = 
        payer._count.expensesBuyer > 0 || 
        payer._count.expensesPayer > 0 || 
        payer._count.expenseSplits > 0 ||
        payer._count.creditCards > 0;

      if (hasActiveDependencies) {
        res.status(400).json({
          success: false,
          message: 'Não é possível excluir pagador que possui despesas ou cartões ativos',
          data: {
            expenseCount: payer._count.expensesBuyer + payer._count.expensesPayer,
            splitCount: payer._count.expenseSplits,
            creditCardCount: payer._count.creditCards,
          },
        } as ApiResponse);
        return;
      }

      // Soft delete by setting active to false
      const deletedPayer = await prisma.payer.update({
        where: { id: payerId },
        data: { active: false },
      });

      res.json({
        success: true,
        message: 'Pagador excluído com sucesso',
        data: deletedPayer,
      } as ApiResponse);
    } catch (error) {
      console.error('Delete payer error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Toggle payer active status
   */
  static async toggleActive(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const payerId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get current payer
      const payer = await prisma.payer.findFirst({
        where: { id: payerId, userId },
        select: { id: true, active: true, name: true },
      });

      if (!payer) {
        res.status(404).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      // Toggle active status
      const updatedPayer = await prisma.payer.update({
        where: { id: payerId },
        data: { active: !payer.active },
        include: {
          _count: {
            select: {
              expensesBuyer: { where: { active: true } },
              expensesPayer: { where: { active: true } },
              expenseSplits: true,
              creditCards: { where: { active: true } },
            },
          },
        },
      });

      res.json({
        success: true,
        message: payer.active 
          ? 'Pagador desativado com sucesso' 
          : 'Pagador ativado com sucesso',
        data: updatedPayer,
      } as ApiResponse);
    } catch (error) {
      console.error('Toggle payer active error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get payer statistics
   */
  static async getStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const payerId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { month, year } = req.query;
      const currentMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
      const currentYear = year ? parseInt(year as string) : new Date().getFullYear();

      // Verify payer belongs to user
      const payer = await prisma.payer.findFirst({
        where: { id: payerId, userId },
        select: { id: true, name: true, color: true, active: true },
      });

      if (!payer) {
        res.status(404).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      // Get statistics for the specified period
      const [buyerStats, payerStats, splitStats] = await Promise.all([
        // As buyer
        prisma.expensePayment.aggregate({
          where: {
            month: currentMonth,
            year: currentYear,
            expense: {
              buyerId: payerId,
              active: true,
            },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        // As payer (single responsibility)
        prisma.expensePayment.aggregate({
          where: {
            month: currentMonth,
            year: currentYear,
            expense: {
              payerId: payerId,
              active: true,
              isDivided: false,
            },
          },
          _sum: { amount: true },
          _count: { id: true },
        }),
        // As split payer
        prisma.$queryRaw`
          SELECT 
            SUM(ep.amount * (es.percentage / 100)) as total_amount,
            COUNT(*) as payment_count
          FROM expense_payments ep
          JOIN expense_splits es ON ep.expense_id = es.expense_id
          JOIN expenses e ON ep.expense_id = e.id
          WHERE ep.month = ${currentMonth}
            AND ep.year = ${currentYear}
            AND es.payer_id = ${payerId}
            AND e.active = true
            AND e.is_divided = true
        `,
      ]);

      // Type assertion for raw query result
      const splitResult = splitStats as Array<{ total_amount: string | null; payment_count: bigint }>;
      const splitTotalAmount = splitResult[0]?.total_amount ? parseFloat(splitResult[0].total_amount) : 0;
      const splitPaymentCount = Number(splitResult[0]?.payment_count || 0);

      const stats = {
        payer,
        period: { month: currentMonth, year: currentYear },
        asBuyer: {
          totalAmount: buyerStats._sum.amount?.toNumber() || 0,
          paymentCount: buyerStats._count.id,
        },
        asPayerSingle: {
          totalAmount: payerStats._sum.amount?.toNumber() || 0,
          paymentCount: payerStats._count.id,
        },
        asPayerSplit: {
          totalAmount: Math.round(splitTotalAmount * 100) / 100,
          paymentCount: splitPaymentCount,
        },
        total: {
          totalAmount: Math.round(((payerStats._sum.amount?.toNumber() || 0) + splitTotalAmount) * 100) / 100,
          paymentCount: payerStats._count.id + splitPaymentCount,
        },
      };

      res.json({
        success: true,
        data: stats,
      } as ApiResponse);
    } catch (error) {
      console.error('Get payer stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }
}

export default PayerController;