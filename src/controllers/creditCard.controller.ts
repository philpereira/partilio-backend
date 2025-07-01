import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse, CreateCreditCardRequest } from '../types';
import { schemas } from '../schemas';

const prisma = new PrismaClient();

/**
 * Credit Card Controller
 */
export class CreditCardController {
  /**
   * Get all credit cards
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

      const { active } = req.query;
      
      const where: any = { userId };
      if (active !== undefined) {
        where.active = active === 'true';
      }

      const creditCards = await prisma.creditCard.findMany({
        where,
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
          _count: {
            select: {
              expenses: {
                where: { active: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      res.json({
        success: true,
        data: creditCards,
      } as ApiResponse);
    } catch (error) {
      console.error('Get credit cards error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get credit card by ID
   */
  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const creditCardId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const creditCard = await prisma.creditCard.findFirst({
        where: { id: creditCardId, userId },
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
          expenses: {
            where: { active: true },
            select: {
              id: true,
              description: true,
              supplier: true,
              totalAmount: true,
              installmentAmount: true,
              numberOfInstallments: true,
              startDate: true,
              category: {
                select: {
                  name: true,
                  icon: true,
                  color: true,
                },
              },
            },
            orderBy: { startDate: 'desc' },
            take: 10,
          },
          _count: {
            select: {
              expenses: {
                where: { active: true },
              },
            },
          },
        },
      });

      if (!creditCard) {
        res.status(404).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: creditCard,
      } as ApiResponse);
    } catch (error) {
      console.error('Get credit card by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Create new credit card
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
      const validation = schemas.creditCard.create.safeParse(req.body);
      
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

      const creditCardData: CreateCreditCardRequest = validation.data;

      // Verify that payer belongs to user
      const payer = await prisma.payer.findFirst({
        where: { id: creditCardData.payerId, userId, active: true },
      });

      if (!payer) {
        res.status(400).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      // Check if credit card name already exists for this user
      const existingCard = await prisma.creditCard.findFirst({
        where: {
          userId,
          name: {
            equals: creditCardData.name,
            mode: 'insensitive',
          },
        },
      });

      if (existingCard) {
        res.status(409).json({
          success: false,
          message: 'Já existe um cartão com este nome',
        } as ApiResponse);
        return;
      }

      // Create credit card
      const creditCard = await prisma.creditCard.create({
        data: {
          name: creditCardData.name,
          holder: creditCardData.holder,
          closingDay: creditCardData.closingDay,
          dueDay: creditCardData.dueDay,
          limit: creditCardData.limit,
          userId,
          payerId: creditCardData.payerId,
        },
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
          _count: {
            select: {
              expenses: {
                where: { active: true },
              },
            },
          },
        },
      });

      res.status(201).json({
        success: true,
        message: 'Cartão de crédito criado com sucesso',
        data: creditCard,
      } as ApiResponse);
    } catch (error) {
      console.error('Create credit card error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update credit card
   */
  static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const creditCardId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.creditCard.update.safeParse(req.body);
      
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

      // Check if credit card exists and belongs to user
      const existingCard = await prisma.creditCard.findFirst({
        where: { id: creditCardId, userId },
      });

      if (!existingCard) {
        res.status(404).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      // Verify payer belongs to user if being updated
      if (updateData.payerId) {
        const payer = await prisma.payer.findFirst({
          where: { id: updateData.payerId, userId, active: true },
        });

        if (!payer) {
          res.status(400).json({
            success: false,
            message: 'Pagador não encontrado',
          } as ApiResponse);
          return;
        }
      }

      // Check if new name conflicts with existing cards
      if (updateData.name) {
        const nameConflict = await prisma.creditCard.findFirst({
          where: {
            userId,
            id: { not: creditCardId },
            name: {
              equals: updateData.name,
              mode: 'insensitive',
            },
          },
        });

        if (nameConflict) {
          res.status(409).json({
            success: false,
            message: 'Já existe um cartão com este nome',
          } as ApiResponse);
          return;
        }
      }

      // Update credit card
      const updatedCard = await prisma.creditCard.update({
        where: { id: creditCardId },
        data: updateData,
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
          _count: {
            select: {
              expenses: {
                where: { active: true },
              },
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Cartão de crédito atualizado com sucesso',
        data: updatedCard,
      } as ApiResponse);
    } catch (error) {
      console.error('Update credit card error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Delete credit card
   */
  static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const creditCardId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if credit card exists and belongs to user
      const creditCard = await prisma.creditCard.findFirst({
        where: { id: creditCardId, userId },
        include: {
          _count: {
            select: {
              expenses: {
                where: { active: true },
              },
            },
          },
        },
      });

      if (!creditCard) {
        res.status(404).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      // Check if credit card has active expenses
      if (creditCard._count.expenses > 0) {
        res.status(400).json({
          success: false,
          message: 'Não é possível excluir cartão que possui despesas ativas',
          data: {
            expenseCount: creditCard._count.expenses,
          },
        } as ApiResponse);
        return;
      }

      // Delete credit card
      await prisma.creditCard.delete({
        where: { id: creditCardId },
      });

      res.json({
        success: true,
        message: 'Cartão de crédito excluído com sucesso',
      } as ApiResponse);
    } catch (error) {
      console.error('Delete credit card error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Toggle credit card active status
   */
  static async toggleActive(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const creditCardId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get current credit card
      const creditCard = await prisma.creditCard.findFirst({
        where: { id: creditCardId, userId },
        select: { id: true, active: true, name: true },
      });

      if (!creditCard) {
        res.status(404).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      // Toggle active status
      const updatedCard = await prisma.creditCard.update({
        where: { id: creditCardId },
        data: { active: !creditCard.active },
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: creditCard.active 
          ? 'Cartão de crédito desativado com sucesso' 
          : 'Cartão de crédito ativado com sucesso',
        data: updatedCard,
      } as ApiResponse);
    } catch (error) {
      console.error('Toggle credit card active error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get credit card usage summary
   */
  static async getUsageSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const creditCardId = req.params.id;

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

      // Verify credit card belongs to user
      const creditCard = await prisma.creditCard.findFirst({
        where: { id: creditCardId, userId },
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      });

      if (!creditCard) {
        res.status(404).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      // Get usage data for the specified period
      const usageData = await prisma.expensePayment.aggregate({
        where: {
          month: currentMonth,
          year: currentYear,
          expense: {
            creditCardId,
            active: true,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          id: true,
        },
      });

      // Get expense breakdown by category
      const categoryBreakdown = await prisma.expensePayment.findMany({
        where: {
          month: currentMonth,
          year: currentYear,
          expense: {
            creditCardId,
            active: true,
          },
        },
        include: {
          expense: {
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  icon: true,
                  color: true,
                },
              },
            },
          },
        },
      });

      // Group by category
      const categoryTotals = new Map<string, {
        category: any;
        totalAmount: number;
        transactionCount: number;
      }>();

      for (const payment of categoryBreakdown) {
        const categoryId = payment.expense.category.id;
        const amount = payment.amount.toNumber();

        if (!categoryTotals.has(categoryId)) {
          categoryTotals.set(categoryId, {
            category: payment.expense.category,
            totalAmount: 0,
            transactionCount: 0,
          });
        }

        const total = categoryTotals.get(categoryId)!;
        total.totalAmount += amount;
        total.transactionCount += 1;
      }

      // Calculate utilization percentage if limit is set
      const totalUsed = usageData._sum.amount?.toNumber() || 0;
      const utilizationPercentage = creditCard.limit 
        ? (totalUsed / creditCard.limit.toNumber()) * 100 
        : null;

      const summary = {
        creditCard: {
          id: creditCard.id,
          name: creditCard.name,
          holder: creditCard.holder,
          limit: creditCard.limit?.toNumber(),
          closingDay: creditCard.closingDay,
          dueDay: creditCard.dueDay,
          payer: creditCard.payer,
        },
        period: { month: currentMonth, year: currentYear },
        usage: {
          totalAmount: Math.round(totalUsed * 100) / 100,
          transactionCount: usageData._count.id,
          utilizationPercentage: utilizationPercentage 
            ? Math.round(utilizationPercentage * 100) / 100 
            : null,
          availableLimit: creditCard.limit 
            ? Math.round((creditCard.limit.toNumber() - totalUsed) * 100) / 100 
            : null,
        },
        categoryBreakdown: Array.from(categoryTotals.values())
          .map(item => ({
            ...item,
            totalAmount: Math.round(item.totalAmount * 100) / 100,
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount),
      };

      res.json({
        success: true,
        data: summary,
      } as ApiResponse);
    } catch (error) {
      console.error('Get credit card usage summary error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get upcoming due dates for all credit cards
   */
  static async getUpcomingDueDates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

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

      // Get all active credit cards for user
      const creditCards = await prisma.creditCard.findMany({
        where: { userId, active: true },
        include: {
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      });

      // Calculate due dates and amounts for each card
      const dueDates = await Promise.all(
        creditCards.map(async (card) => {
          // Get total amount for this card in the specified period
          const usage = await prisma.expensePayment.aggregate({
            where: {
              month: currentMonth,
              year: currentYear,
              expense: {
                creditCardId: card.id,
                active: true,
              },
            },
            _sum: {
              amount: true,
            },
            _count: {
              id: true,
            },
          });

          // Calculate due date for the period
          const dueDate = new Date(currentYear, currentMonth - 1, card.dueDay);
          
          // If due day doesn't exist in the month, use last day of month
          if (dueDate.getMonth() !== currentMonth - 1) {
            dueDate.setDate(0); // Last day of previous month
          }

          return {
            creditCard: {
              id: card.id,
              name: card.name,
              holder: card.holder,
              dueDay: card.dueDay,
              limit: card.limit?.toNumber(),
              payer: card.payer,
            },
            dueDate,
            amount: usage._sum.amount?.toNumber() || 0,
            transactionCount: usage._count.id,
            daysUntilDue: Math.ceil((dueDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
          };
        })
      );

      // Sort by due date
      dueDates.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      res.json({
        success: true,
        data: {
          period: { month: currentMonth, year: currentYear },
          dueDates: dueDates.map(item => ({
            ...item,
            amount: Math.round(item.amount * 100) / 100,
          })),
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get upcoming due dates error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }
}

export default CreditCardController;