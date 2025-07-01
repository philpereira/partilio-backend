import { Response } from 'express';
import { PrismaClient, ExpensePaymentStatus } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse, DashboardData, PeriodParams } from '../types';
import { schemas } from '../schemas';
import { FinancialUtils, DateUtils } from '../utils/financial';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Dashboard Controller
 */
export class DashboardController {
  /**
   * Get dashboard data for specific period
   */
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Parse and validate query parameters
      const validation = schemas.dashboard.safeParse({
        month: req.query.month ? parseInt(req.query.month as string) : undefined,
        year: req.query.year ? parseInt(req.query.year as string) : undefined,
      });

      if (!validation.success) {
        res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos',
          errors: validation.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      // Use current month/year if not provided
      const now = new Date();
      const month = validation.data.month || (now.getMonth() + 1);
      const year = validation.data.year || now.getFullYear();

      const period: PeriodParams = { month, year };

      // Get dashboard data
      const [
        summary,
        categoryBreakdown,
        upcomingDues,
        trends
      ] = await Promise.all([
        this.getSummary(userId, period),
        this.getCategoryBreakdown(userId, period),
        this.getUpcomingDues(userId, period),
        this.getTrends(userId, period),
      ]);

      const dashboardData: DashboardData = {
        period,
        summary,
        categoryBreakdown,
        upcomingDues,
        trends,
      };

      res.json({
        success: true,
        data: dashboardData,
      } as ApiResponse);
    } catch (error) {
      console.error('Get dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get monthly summary with payer breakdown
   */
  private static async getSummary(userId: string, period: PeriodParams) {
    // Get all payments for the period
    const payments = await prisma.expensePayment.findMany({
      where: {
        month: period.month,
        year: period.year,
        expense: {
          userId,
          active: true,
          paused: false,
        },
      },
      include: {
        expense: {
          include: {
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
            payer: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    // Calculate totals by status
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;

    const payerTotals = new Map<string, {
      payerId: string;
      payerName: string;
      payerColor: string;
      totalAmount: number;
      paidAmount: number;
      pendingAmount: number;
      overdueAmount: number;
    }>();

    for (const payment of payments) {
      const amount = payment.amount.toNumber();
      totalAmount = FinancialUtils.add(totalAmount, amount);

      switch (payment.status) {
        case ExpensePaymentStatus.PAID:
          paidAmount = FinancialUtils.add(paidAmount, amount);
          break;
        case ExpensePaymentStatus.OVERDUE:
          overdueAmount = FinancialUtils.add(overdueAmount, amount);
          break;
        case ExpensePaymentStatus.PENDING:
        case ExpensePaymentStatus.FUTURE:
          pendingAmount = FinancialUtils.add(pendingAmount, amount);
          break;
      }

      // Calculate payer breakdown
      if (payment.expense.isDivided && payment.expense.splits.length > 0) {
        // For divided expenses, calculate each payer's portion
        for (const split of payment.expense.splits) {
          const payerAmount = FinancialUtils.percentage(amount, split.percentage.toNumber());
          this.updatePayerTotals(payerTotals, split.payer, payment.status, payerAmount);
        }
      } else if (payment.expense.payer) {
        // For single payer expenses
        this.updatePayerTotals(payerTotals, payment.expense.payer, payment.status, amount);
      }
    }

    return {
      totalAmount: FinancialUtils.round(totalAmount),
      paidAmount: FinancialUtils.round(paidAmount),
      pendingAmount: FinancialUtils.round(pendingAmount),
      overdueAmount: FinancialUtils.round(overdueAmount),
      payerBreakdown: Array.from(payerTotals.values()).map(payer => ({
        ...payer,
        totalAmount: FinancialUtils.round(payer.totalAmount),
        paidAmount: FinancialUtils.round(payer.paidAmount),
        pendingAmount: FinancialUtils.round(payer.pendingAmount),
        overdueAmount: FinancialUtils.round(payer.overdueAmount),
      })),
    };
  }

  /**
   * Helper to update payer totals
   */
  private static updatePayerTotals(
    payerTotals: Map<string, any>,
    payer: { id: string; name: string; color: string },
    status: ExpensePaymentStatus,
    amount: number
  ) {
    if (!payerTotals.has(payer.id)) {
      payerTotals.set(payer.id, {
        payerId: payer.id,
        payerName: payer.name,
        payerColor: payer.color,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
      });
    }

    const payerTotal = payerTotals.get(payer.id);
    payerTotal.totalAmount = FinancialUtils.add(payerTotal.totalAmount, amount);

    switch (status) {
      case ExpensePaymentStatus.PAID:
        payerTotal.paidAmount = FinancialUtils.add(payerTotal.paidAmount, amount);
        break;
      case ExpensePaymentStatus.OVERDUE:
        payerTotal.overdueAmount = FinancialUtils.add(payerTotal.overdueAmount, amount);
        break;
      case ExpensePaymentStatus.PENDING:
      case ExpensePaymentStatus.FUTURE:
        payerTotal.pendingAmount = FinancialUtils.add(payerTotal.pendingAmount, amount);
        break;
    }
  }

  /**
   * Get category breakdown for the period
   */
  private static async getCategoryBreakdown(userId: string, period: PeriodParams) {
    const categoryData = await prisma.expensePayment.groupBy({
      by: ['expenseId'],
      where: {
        month: period.month,
        year: period.year,
        expense: {
          userId,
          active: true,
          paused: false,
        },
      },
      _sum: {
        amount: true,
      },
    });

    // Get expense details for category information
    const expenseIds = categoryData.map(item => item.expenseId);
    
    if (expenseIds.length === 0) {
      return [];
    }

    const expenses = await prisma.expense.findMany({
      where: {
        id: { in: expenseIds },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    // Group by category
    const categoryTotals = new Map<string, {
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      totalAmount: number;
      expenseCount: number;
    }>();

    for (const expense of expenses) {
      const paymentData = categoryData.find(item => item.expenseId === expense.id);
      const amount = paymentData?._sum.amount?.toNumber() || 0;

      if (!categoryTotals.has(expense.category.id)) {
        categoryTotals.set(expense.category.id, {
          categoryId: expense.category.id,
          categoryName: expense.category.name,
          categoryColor: expense.category.color,
          totalAmount: 0,
          expenseCount: 0,
        });
      }

      const categoryTotal = categoryTotals.get(expense.category.id);
      categoryTotal!.totalAmount = FinancialUtils.add(categoryTotal!.totalAmount, amount);
      categoryTotal!.expenseCount += 1;
    }

    return Array.from(categoryTotals.values())
      .map(category => ({
        ...category,
        totalAmount: FinancialUtils.round(category.totalAmount),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }

  /**
   * Get upcoming due payments
   */
  private static async getUpcomingDues(userId: string, period: PeriodParams) {
    const now = new Date();
    const endOfCurrentMonth = endOfMonth(new Date(period.year, period.month - 1, 1));

    // Get payments due in the next 30 days
    const upcomingPayments = await prisma.expensePayment.findMany({
      where: {
        dueDate: {
          gte: now,
          lte: endOfCurrentMonth,
        },
        status: {
          in: [ExpensePaymentStatus.PENDING, ExpensePaymentStatus.OVERDUE],
        },
        expense: {
          userId,
          active: true,
          paused: false,
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
      orderBy: {
        dueDate: 'asc',
      },
      take: 10, // Limit to next 10 due payments
    });

    return upcomingPayments.map(payment => ({
      expense: payment.expense,
      payment,
      daysUntilDue: DateUtils.getDaysUntilDue(payment.dueDate),
    }));
  }

  /**
   * Get trends comparison with previous period
   */
  private static async getTrends(userId: string, period: PeriodParams) {
    // Get current month data
    const currentMonthPayments = await this.getMonthlyTotal(userId, period.month, period.year);
    
    // Get previous month data
    const previousMonth = period.month === 1 ? 12 : period.month - 1;
    const previousYear = period.month === 1 ? period.year - 1 : period.year;
    const previousMonthPayments = await this.getMonthlyTotal(userId, previousMonth, previousYear);

    // Calculate monthly comparison
    const monthlyComparison = {
      currentMonth: currentMonthPayments,
      previousMonth: previousMonthPayments,
      percentageChange: FinancialUtils.getPercentageChange(previousMonthPayments, currentMonthPayments),
    };

    // Get category trends
    const categoryTrends = await this.getCategoryTrends(userId, period, previousMonth, previousYear);

    return {
      monthlyComparison,
      categoryTrends,
    };
  }

  /**
   * Get total amount for a specific month
   */
  private static async getMonthlyTotal(userId: string, month: number, year: number): Promise<number> {
    const result = await prisma.expensePayment.aggregate({
      where: {
        month,
        year,
        expense: {
          userId,
          active: true,
          paused: false,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return FinancialUtils.round(result._sum.amount?.toNumber() || 0);
  }

  /**
   * Get category trends comparison
   */
  private static async getCategoryTrends(
    userId: string,
    currentPeriod: PeriodParams,
    previousMonth: number,
    previousYear: number
  ) {
    // Get current month category data
    const currentCategoryData = await this.getCategoryTotals(userId, currentPeriod.month, currentPeriod.year);
    
    // Get previous month category data
    const previousCategoryData = await this.getCategoryTotals(userId, previousMonth, previousYear);

    // Merge and calculate trends
    const allCategories = new Set([
      ...currentCategoryData.keys(),
      ...previousCategoryData.keys(),
    ]);

    return Array.from(allCategories).map(categoryId => {
      const currentAmount = currentCategoryData.get(categoryId)?.totalAmount || 0;
      const previousAmount = previousCategoryData.get(categoryId)?.totalAmount || 0;
      const categoryInfo = currentCategoryData.get(categoryId) || previousCategoryData.get(categoryId);

      return {
        categoryId,
        categoryName: categoryInfo?.categoryName || 'Categoria Removida',
        currentMonth: currentAmount,
        previousMonth: previousAmount,
        percentageChange: FinancialUtils.getPercentageChange(previousAmount, currentAmount),
      };
    }).filter(trend => trend.currentMonth > 0 || trend.previousMonth > 0)
      .sort((a, b) => b.currentMonth - a.currentMonth);
  }

  /**
   * Get category totals for a specific month
   */
  private static async getCategoryTotals(userId: string, month: number, year: number) {
    const payments = await prisma.expensePayment.findMany({
      where: {
        month,
        year,
        expense: {
          userId,
          active: true,
          paused: false,
        },
      },
      include: {
        expense: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const categoryTotals = new Map<string, {
      categoryId: string;
      categoryName: string;
      totalAmount: number;
    }>();

    for (const payment of payments) {
      const categoryId = payment.expense.category.id;
      const amount = payment.amount.toNumber();

      if (!categoryTotals.has(categoryId)) {
        categoryTotals.set(categoryId, {
          categoryId,
          categoryName: payment.expense.category.name,
          totalAmount: 0,
        });
      }

      const categoryTotal = categoryTotals.get(categoryId);
      categoryTotal!.totalAmount = FinancialUtils.add(categoryTotal!.totalAmount, amount);
    }

    // Round amounts
    for (const [categoryId, data] of categoryTotals.entries()) {
      data.totalAmount = FinancialUtils.round(data.totalAmount);
    }

    return categoryTotals;
  }

  /**
   * Get quick stats for multiple periods
   */
  static async getQuickStats(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Get quick stats for current and previous months
      const [currentMonthTotal, previousMonthTotal, yearToDateTotal, totalExpenses] = await Promise.all([
        this.getMonthlyTotal(userId, currentMonth, currentYear),
        this.getMonthlyTotal(
          userId, 
          currentMonth === 1 ? 12 : currentMonth - 1, 
          currentMonth === 1 ? currentYear - 1 : currentYear
        ),
        this.getYearToDateTotal(userId, currentYear),
        prisma.expense.count({
          where: { userId, active: true },
        }),
      ]);

      const monthlyChange = FinancialUtils.getPercentageChange(previousMonthTotal, currentMonthTotal);

      res.json({
        success: true,
        data: {
          currentMonth: {
            amount: currentMonthTotal,
            period: `${DateUtils.getMonthName(currentMonth)} ${currentYear}`,
          },
          previousMonth: {
            amount: previousMonthTotal,
            period: `${DateUtils.getMonthName(currentMonth === 1 ? 12 : currentMonth - 1)} ${currentMonth === 1 ? currentYear - 1 : currentYear}`,
          },
          monthlyChange: {
            percentage: monthlyChange,
            direction: monthlyChange > 0 ? 'up' : monthlyChange < 0 ? 'down' : 'stable',
          },
          yearToDate: {
            amount: yearToDateTotal,
            period: `${currentYear}`,
          },
          totalExpenses,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get quick stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get year-to-date total
   */
  private static async getYearToDateTotal(userId: string, year: number): Promise<number> {
    const result = await prisma.expensePayment.aggregate({
      where: {
        year,
        expense: {
          userId,
          active: true,
          paused: false,
        },
      },
      _sum: {
        amount: true,
      },
    });

    return FinancialUtils.round(result._sum.amount?.toNumber() || 0);
  }
}

export default DashboardController;