import { Response } from 'express';
import { PrismaClient, ExpensePaymentStatus } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { schemas } from '../schemas';

const prisma = new PrismaClient();

/**
 * Payment Controller
 */
export class PaymentController {
  /**
   * Get payments for a specific period
   */
  static async getPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { month, year, status, expenseId } = req.query;

      // Build where clause
      const where: any = {
        expense: {
          userId,
          active: true,
        },
      };

      if (month) {
        const monthNum = parseInt(month as string);
        if (monthNum >= 1 && monthNum <= 12) {
          where.month = monthNum;
        }
      }

      if (year) {
        const yearNum = parseInt(year as string);
        if (yearNum >= 2000 && yearNum <= 2100) {
          where.year = yearNum;
        }
      }

      if (status && typeof status === 'string') {
        const statusArray = status.split(',').filter(s => 
          Object.values(ExpensePaymentStatus).includes(s as ExpensePaymentStatus)
        );
        if (statusArray.length > 0) {
          where.status = { in: statusArray };
        }
      }

      if (expenseId) {
        where.expenseId = expenseId;
      }

      const payments = await prisma.expensePayment.findMany({
        where,
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
              subcategory: {
                select: {
                  id: true,
                  name: true,
                  icon: true,
                },
              },
              buyer: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
              payer: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
              splits: {
                include: {
                  payer: {
                    select: {
                      id: true,
                      name: true,
                      color: true,
                    },
                  },
                },
              },
              creditCard: {
                select: {
                  id: true,
                  name: true,
                  holder: true,
                },
              },
            },
          },
        },
        orderBy: [
          { dueDate: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      res.json({
        success: true,
        data: payments,
      } as ApiResponse);
    } catch (error) {
      console.error('Get payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Mark a payment as paid
   */
  static async markAsPaid(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const validation = schemas.payment.mark.safeParse(req.body);
      
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

      const { expenseId, month, year, paidAt } = validation.data;

      // Verify that expense belongs to user
      const expense = await prisma.expense.findFirst({
        where: { id: expenseId, userId },
      });

      if (!expense) {
        res.status(404).json({
          success: false,
          message: 'Despesa não encontrada',
        } as ApiResponse);
        return;
      }

      // Find the specific payment
      const payment = await prisma.expensePayment.findUnique({
        where: {
          expenseId_month_year: {
            expenseId,
            month,
            year,
          },
        },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Pagamento não encontrado',
        } as ApiResponse);
        return;
      }

      // Update payment status
      const updatedPayment = await prisma.expensePayment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: ExpensePaymentStatus.PAID,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
        },
        include: {
          expense: {
            select: {
              id: true,
              description: true,
              supplier: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Pagamento marcado como pago com sucesso',
        data: updatedPayment,
      } as ApiResponse);
    } catch (error) {
      console.error('Mark payment as paid error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Mark multiple payments as paid
   */
  static async bulkMarkAsPaid(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const validation = schemas.payment.bulkMark.safeParse(req.body);
      
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

      const { payments } = validation.data;

      // Verify that all expenses belong to user
      const expenseIds = payments.map(p => p.expenseId);
      const validExpenses = await prisma.expense.findMany({
        where: {
          id: { in: expenseIds },
          userId,
        },
        select: { id: true },
      });

      if (validExpenses.length !== expenseIds.length) {
        res.status(400).json({
          success: false,
          message: 'Uma ou mais despesas não foram encontradas',
        } as ApiResponse);
        return;
      }

      // Update payments in transaction
      const result = await prisma.$transaction(async (tx) => {
        const updatedPayments = [];

        for (const paymentData of payments) {
          const payment = await tx.expensePayment.findUnique({
            where: {
              expenseId_month_year: {
                expenseId: paymentData.expenseId,
                month: paymentData.month,
                year: paymentData.year,
              },
            },
          });

          if (payment) {
            const updatedPayment = await tx.expensePayment.update({
              where: { id: payment.id },
              data: {
                status: ExpensePaymentStatus.PAID,
                paidAt: paymentData.paidAt ? new Date(paymentData.paidAt) : new Date(),
              },
              include: {
                expense: {
                  select: {
                    id: true,
                    description: true,
                    supplier: true,
                  },
                },
              },
            });

            updatedPayments.push(updatedPayment);
          }
        }

        return updatedPayments;
      });

      res.json({
        success: true,
        message: `${result.length} pagamentos marcados como pagos com sucesso`,
        data: result,
      } as ApiResponse);
    } catch (error) {
      console.error('Bulk mark payments as paid error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Revert payment status back to pending
   */
  static async revertPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const paymentId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Find payment and verify ownership
      const payment = await prisma.expensePayment.findFirst({
        where: {
          id: paymentId,
          expense: { userId },
        },
        include: {
          expense: {
            select: {
              id: true,
              description: true,
              supplier: true,
            },
          },
        },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Pagamento não encontrado',
        } as ApiResponse);
        return;
      }

      // Update payment status to pending
      const updatedPayment = await prisma.expensePayment.update({
        where: { id: paymentId },
        data: {
          status: ExpensePaymentStatus.PENDING,
          paidAt: null,
        },
        include: {
          expense: {
            select: {
              id: true,
              description: true,
              supplier: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Status do pagamento revertido para pendente',
        data: updatedPayment,
      } as ApiResponse);
    } catch (error) {
      console.error('Revert payment error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update payment due date
   */
  static async updateDueDate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const paymentId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { dueDate } = req.body;

      if (!dueDate) {
        res.status(400).json({
          success: false,
          message: 'Data de vencimento é obrigatória',
        } as ApiResponse);
        return;
      }

      // Validate date
      const newDueDate = new Date(dueDate);
      if (isNaN(newDueDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Data de vencimento inválida',
        } as ApiResponse);
        return;
      }

      // Find payment and verify ownership
      const payment = await prisma.expensePayment.findFirst({
        where: {
          id: paymentId,
          expense: { userId },
        },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Pagamento não encontrado',
        } as ApiResponse);
        return;
      }

      // Update due date and recalculate status if needed
      let newStatus = payment.status;
      const now = new Date();

      if (newDueDate < now && payment.status === ExpensePaymentStatus.PENDING) {
        newStatus = ExpensePaymentStatus.OVERDUE;
      } else if (newDueDate >= now && payment.status === ExpensePaymentStatus.OVERDUE) {
        newStatus = ExpensePaymentStatus.PENDING;
      }

      const updatedPayment = await prisma.expensePayment.update({
        where: { id: paymentId },
        data: {
          dueDate: newDueDate,
          status: newStatus,
        },
        include: {
          expense: {
            select: {
              id: true,
              description: true,
              supplier: true,
            },
          },
        },
      });

      res.json({
        success: true,
        message: 'Data de vencimento atualizada com sucesso',
        data: updatedPayment,
      } as ApiResponse);
    } catch (error) {
      console.error('Update payment due date error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get payment statistics for a period
   */
  static async getPaymentStats(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Get payment statistics
      const stats = await prisma.expensePayment.groupBy({
        by: ['status'],
        where: {
          month: currentMonth,
          year: currentYear,
          expense: {
            userId,
            active: true,
          },
        },
        _count: { status: true },
        _sum: { amount: true },
      });

      // Calculate totals by status
      const paymentStats = {
        paid: { count: 0, amount: 0 },
        pending: { count: 0, amount: 0 },
        overdue: { count: 0, amount: 0 },
        future: { count: 0, amount: 0 },
        total: { count: 0, amount: 0 },
      };

      for (const stat of stats) {
        const count = stat._count.status;
        const amount = stat._sum.amount?.toNumber() || 0;

        paymentStats.total.count += count;
        paymentStats.total.amount += amount;

        switch (stat.status) {
          case ExpensePaymentStatus.PAID:
            paymentStats.paid = { count, amount };
            break;
          case ExpensePaymentStatus.PENDING:
            paymentStats.pending = { count, amount };
            break;
          case ExpensePaymentStatus.OVERDUE:
            paymentStats.overdue = { count, amount };
            break;
          case ExpensePaymentStatus.FUTURE:
            paymentStats.future = { count, amount };
            break;
        }
      }

      // Calculate completion rate
      const completionRate = paymentStats.total.count > 0 
        ? (paymentStats.paid.count / paymentStats.total.count) * 100 
        : 0;

      res.json({
        success: true,
        data: {
          period: { month: currentMonth, year: currentYear },
          stats: paymentStats,
          completionRate: Math.round(completionRate * 100) / 100,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get payment stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update overdue payments status automatically
   */
  static async updateOverduePayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const now = new Date();

      // Update pending payments that are now overdue
      const overdueResult = await prisma.expensePayment.updateMany({
        where: {
          status: ExpensePaymentStatus.PENDING,
          dueDate: { lt: now },
          expense: {
            userId,
            active: true,
          },
        },
        data: {
          status: ExpensePaymentStatus.OVERDUE,
        },
      });

      // Update future payments that are now pending
      const pendingResult = await prisma.expensePayment.updateMany({
        where: {
          status: ExpensePaymentStatus.FUTURE,
          dueDate: { lte: now },
          expense: {
            userId,
            active: true,
          },
        },
        data: {
          status: ExpensePaymentStatus.PENDING,
        },
      });

      res.json({
        success: true,
        message: 'Status dos pagamentos atualizado com sucesso',
        data: {
          overdueUpdated: overdueResult.count,
          pendingUpdated: pendingResult.count,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Update overdue payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }
}

export default PaymentController;