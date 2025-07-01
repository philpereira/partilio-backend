import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { schemas } from '../schemas';
import { logger } from '../utils/logger';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const prisma = new PrismaClient();

/**
 * Report Controller for generating various financial reports
 */
export class ReportController {
  /**
   * Generate expense report with filtering options
   */
  static async expenseReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const {
        startDate,
        endDate,
        categoryId,
        payerId,
        type,
        status = 'all',
        groupBy = 'month',
        period = '12months'
      } = req.query;

      // Build date range
      let dateRange: { start: Date; end: Date };
      
      if (startDate && endDate) {
        dateRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };
      } else {
        // Default to last 12 months
        const now = new Date();
        dateRange = {
          start: subMonths(startOfMonth(now), 11),
          end: endOfMonth(now)
        };
      }

      // Build filters
      const filters: any = {
        userId,
        active: true,
        startDate: {
          lte: dateRange.end
        }
      };

      if (categoryId) {
        filters.categoryId = categoryId as string;
      }

      if (payerId) {
        filters.OR = [
          { buyerId: payerId as string },
          { payerId: payerId as string }
        ];
      }

      if (type && type !== 'all') {
        const types = Array.isArray(type) ? type : [type];
        filters.type = { in: types };
      }

      // Get expenses with related data
      const expenses = await prisma.expense.findMany({
        where: filters,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true
            }
          },
          subcategory: {
            select: {
              id: true,
              name: true,
              icon: true
            }
          },
          buyer: {
            select: {
              id: true,
              name: true,
              color: true
            }
          },
          payer: {
            select: {
              id: true,
              name: true,
              color: true
            }
          },
          creditCard: {
            select: {
              id: true,
              name: true,
              holder: true
            }
          },
          payments: {
            where: {
              month: {
                gte: dateRange.start.getMonth() + 1,
                lte: dateRange.end.getMonth() + 1
              },
              year: {
                gte: dateRange.start.getFullYear(),
                lte: dateRange.end.getFullYear()
              },
              ...(status !== 'all' && {
                status: status as string
              })
            },
            orderBy: [
              { year: 'asc' },
              { month: 'asc' }
            ]
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Process data for grouping
      const groupedData = new Map<string, {
        period: string;
        totalAmount: number;
        paidAmount: number;
        pendingAmount: number;
        overdueAmount: number;
        expenseCount: number;
        paymentCount: number;
        categories: Map<string, number>;
        payers: Map<string, number>;
      }>();

      for (const expense of expenses) {
        for (const payment of expense.payments) {
          const periodKey = groupBy === 'month' 
            ? `${payment.year}-${payment.month.toString().padStart(2, '0')}`
            : groupBy === 'year'
            ? payment.year.toString()
            : `${payment.year}-${Math.ceil(payment.month / 3)}Q`;

          if (!groupedData.has(periodKey)) {
            groupedData.set(periodKey, {
              period: periodKey,
              totalAmount: 0,
              paidAmount: 0,
              pendingAmount: 0,
              overdueAmount: 0,
              expenseCount: 0,
              paymentCount: 0,
              categories: new Map<string, number>(),
              payers: new Map<string, number>()
            });
          }

          const group = groupedData.get(periodKey)!;
          const amount = payment.amount.toNumber();

          group.totalAmount += amount;
          group.paymentCount += 1;

          // Status breakdown
          switch (payment.status) {
            case 'PAID':
              group.paidAmount += amount;
              break;
            case 'PENDING':
              group.pendingAmount += amount;
              break;
            case 'OVERDUE':
              group.overdueAmount += amount;
              break;
          }

          // Category breakdown
          const categoryName = expense.category.name;
          group.categories.set(
            categoryName,
            (group.categories.get(categoryName) || 0) + amount
          );

          // Payer breakdown
          const payerName = expense.buyer.name;
          group.payers.set(
            payerName,
            (group.payers.get(payerName) || 0) + amount
          );
        }
      }

      // Convert grouped data to array and sort
      const reportData = Array.from(groupedData.values())
        .map(group => ({
          ...group,
          categories: Array.from(group.categories.entries())
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount),
          payers: Array.from(group.payers.entries())
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount),
          averageExpenseValue: group.paymentCount > 0 
            ? Math.round((group.totalAmount / group.paymentCount) * 100) / 100 
            : 0
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

      // Calculate summary statistics
      const summary = {
        totalPeriods: reportData.length,
        grandTotal: reportData.reduce((sum, period) => sum + period.totalAmount, 0),
        totalPaid: reportData.reduce((sum, period) => sum + period.paidAmount, 0),
        totalPending: reportData.reduce((sum, period) => sum + period.pendingAmount, 0),
        totalOverdue: reportData.reduce((sum, period) => sum + period.overdueAmount, 0),
        averagePerPeriod: reportData.length > 0 
          ? Math.round((reportData.reduce((sum, period) => sum + period.totalAmount, 0) / reportData.length) * 100) / 100
          : 0,
        uniqueExpenses: expenses.length,
        totalPayments: reportData.reduce((sum, period) => sum + period.paymentCount, 0)
      };

      logger.info('Expense report generated', {
        userId,
        filters: { categoryId, payerId, type, status, groupBy, period },
        summary: {
          periods: summary.totalPeriods,
          total: summary.grandTotal,
          expenses: summary.uniqueExpenses
        }
      });

      res.json({
        success: true,
        data: {
          summary,
          periods: reportData,
          filters: {
            dateRange,
            categoryId,
            payerId,
            type,
            status,
            groupBy,
            period
          },
          meta: {
            generatedAt: new Date().toISOString(),
            reportType: 'expense_report',
            userId
          }
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Expense report generation failed', error as Error, {
        userId: req.user?.id,
        query: req.query
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar relatório de despesas',
      } as ApiResponse);
    }
  }

  /**
   * Generate category usage report
   */
  static async categoryReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { period = '6months' } = req.query;

      // Calculate date range based on period
      const now = new Date();
      const monthsBack = period === '12months' ? 12 : period === '3months' ? 3 : 6;
      const startDate = subMonths(startOfMonth(now), monthsBack - 1);
      const endDate = endOfMonth(now);

      // Get category usage statistics
      const categoryStats = await prisma.category.findMany({
        where: { userId },
        include: {
          expenses: {
            where: {
              active: true,
              startDate: { lte: endDate }
            },
            include: {
              payments: {
                where: {
                  dueDate: {
                    gte: startDate,
                    lte: endDate
                  }
                }
              }
            }
          },
          subcategories: {
            include: {
              expenses: {
                where: {
                  active: true,
                  startDate: { lte: endDate }
                },
                include: {
                  payments: {
                    where: {
                      dueDate: {
                        gte: startDate,
                        lte: endDate
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const categoryReport = categoryStats.map(category => {
        // Calculate totals for main category
        const totalAmount = category.expenses.reduce((sum, expense) => {
          const paymentsTotal = expense.payments.reduce((pSum, payment) => 
            pSum + payment.amount.toNumber(), 0
          );
          return sum + paymentsTotal;
        }, 0);

        const expenseCount = category.expenses.length;
        const paymentCount = category.expenses.reduce((sum, expense) => 
          sum + expense.payments.length, 0
        );

        // Calculate subcategory breakdown
        const subcategoryBreakdown = category.subcategories.map(subcategory => {
          const subAmount = subcategory.expenses.reduce((sum, expense) => {
            const paymentsTotal = expense.payments.reduce((pSum, payment) => 
              pSum + payment.amount.toNumber(), 0
            );
            return sum + paymentsTotal;
          }, 0);

          return {
            id: subcategory.id,
            name: subcategory.name,
            icon: subcategory.icon,
            totalAmount: Math.round(subAmount * 100) / 100,
            expenseCount: subcategory.expenses.length,
            paymentCount: subcategory.expenses.reduce((sum, expense) => 
              sum + expense.payments.length, 0
            ),
            percentage: totalAmount > 0 ? Math.round((subAmount / totalAmount) * 10000) / 100 : 0
          };
        }).sort((a, b) => b.totalAmount - a.totalAmount);

        return {
          id: category.id,
          name: category.name,
          icon: category.icon,
          color: category.color,
          totalAmount: Math.round(totalAmount * 100) / 100,
          expenseCount,
          paymentCount,
          averageExpenseValue: expenseCount > 0 
            ? Math.round((totalAmount / expenseCount) * 100) / 100 
            : 0,
          subcategories: subcategoryBreakdown,
          subcategoryCount: category.subcategories.length
        };
      }).sort((a, b) => b.totalAmount - a.totalAmount);

      // Calculate summary
      const totalSpent = categoryReport.reduce((sum, cat) => sum + cat.totalAmount, 0);
      const summary = {
        totalCategories: categoryReport.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        averagePerCategory: categoryReport.length > 0 
          ? Math.round((totalSpent / categoryReport.length) * 100) / 100 
          : 0,
        topCategory: categoryReport[0] || null,
        leastUsedCategory: categoryReport[categoryReport.length - 1] || null,
        period: {
          start: startDate,
          end: endDate,
          months: monthsBack
        }
      };

      // Add percentage to each category
      const categoriesWithPercentage = categoryReport.map(category => ({
        ...category,
        percentage: totalSpent > 0 
          ? Math.round((category.totalAmount / totalSpent) * 10000) / 100 
          : 0
      }));

      logger.info('Category report generated', {
        userId,
        period,
        summary: {
          categories: summary.totalCategories,
          totalSpent: summary.totalSpent
        }
      });

      res.json({
        success: true,
        data: {
          summary,
          categories: categoriesWithPercentage,
          meta: {
            generatedAt: new Date().toISOString(),
            reportType: 'category_report',
            period,
            userId
          }
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Category report generation failed', error as Error, {
        userId: req.user?.id,
        query: req.query
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar relatório de categorias',
      } as ApiResponse);
    }
  }

  /**
   * Generate payer report with expense distribution
   */
  static async payerReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { period = '6months' } = req.query;

      // Calculate date range
      const now = new Date();
      const monthsBack = period === '12months' ? 12 : period === '3months' ? 3 : 6;
      const startDate = subMonths(startOfMonth(now), monthsBack - 1);
      const endDate = endOfMonth(now);

      // Get payer statistics
      const payers = await prisma.payer.findMany({
        where: { userId },
        include: {
          expensesBuyer: {
            where: {
              active: true,
              startDate: { lte: endDate }
            },
            include: {
              category: { select: { name: true, color: true } },
              payments: {
                where: {
                  dueDate: { gte: startDate, lte: endDate }
                }
              }
            }
          },
          expensesPayer: {
            where: {
              active: true,
              startDate: { lte: endDate }
            },
            include: {
              payments: {
                where: {
                  dueDate: { gte: startDate, lte: endDate }
                }
              }
            }
          },
          expenseSplits: {
            where: {
              expense: {
                active: true,
                startDate: { lte: endDate }
              }
            },
            include: {
              expense: {
                include: {
                  payments: {
                    where: {
                      dueDate: { gte: startDate, lte: endDate }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const payerReport = payers.map(payer => {
        // Calculate amounts as buyer (who made the purchase)
        const buyerAmount = payer.expensesBuyer.reduce((sum, expense) => {
          const paymentsTotal = expense.payments.reduce((pSum, payment) => 
            pSum + payment.amount.toNumber(), 0
          );
          return sum + paymentsTotal;
        }, 0);

        // Calculate amounts as direct payer
        const payerAmount = payer.expensesPayer.reduce((sum, expense) => {
          const paymentsTotal = expense.payments.reduce((pSum, payment) => 
            pSum + payment.amount.toNumber(), 0
          );
          return sum + paymentsTotal;
        }, 0);

        // Calculate split amounts (what they owe from shared expenses)
        const splitAmount = payer.expenseSplits.reduce((sum, split) => {
          const splitValue = split.amount.toNumber();
          const expensePayments = split.expense.payments.reduce((pSum, payment) => 
            pSum + payment.amount.toNumber(), 0
          );
          // Calculate proportional amount based on expense payments
          const proportionalAmount = expensePayments > 0 
            ? (splitValue / split.expense.totalAmount.toNumber()) * expensePayments
            : 0;
          return sum + proportionalAmount;
        }, 0);

        // Category breakdown for buyer expenses
        const categoryBreakdown = new Map<string, { amount: number; color: string }>();
        payer.expensesBuyer.forEach(expense => {
          const categoryName = expense.category.name;
          const categoryColor = expense.category.color;
          const paymentsTotal = expense.payments.reduce((sum, payment) => 
            sum + payment.amount.toNumber(), 0
          );
          
          const existing = categoryBreakdown.get(categoryName) || { amount: 0, color: categoryColor };
          categoryBreakdown.set(categoryName, {
            amount: existing.amount + paymentsTotal,
            color: categoryColor
          });
        });

        const categories = Array.from(categoryBreakdown.entries()).map(([name, data]) => ({
          name,
          amount: Math.round(data.amount * 100) / 100,
          color: data.color
        })).sort((a, b) => b.amount - a.amount);

        const totalAmount = buyerAmount + payerAmount + splitAmount;

        return {
          id: payer.id,
          name: payer.name,
          color: payer.color,
          active: payer.active,
          totalAmount: Math.round(totalAmount * 100) / 100,
          buyerAmount: Math.round(buyerAmount * 100) / 100,
          payerAmount: Math.round(payerAmount * 100) / 100,
          splitAmount: Math.round(splitAmount * 100) / 100,
          expenseCount: payer.expensesBuyer.length + payer.expensesPayer.length,
          categories,
          averageExpenseValue: (payer.expensesBuyer.length + payer.expensesPayer.length) > 0
            ? Math.round((totalAmount / (payer.expensesBuyer.length + payer.expensesPayer.length)) * 100) / 100
            : 0
        };
      }).sort((a, b) => b.totalAmount - a.totalAmount);

      // Calculate summary
      const totalSpent = payerReport.reduce((sum, payer) => sum + payer.totalAmount, 0);
      const activePayers = payerReport.filter(p => p.active);
      
      const summary = {
        totalPayers: payerReport.length,
        activePayers: activePayers.length,
        totalSpent: Math.round(totalSpent * 100) / 100,
        averagePerPayer: payerReport.length > 0 
          ? Math.round((totalSpent / payerReport.length) * 100) / 100 
          : 0,
        topSpender: payerReport[0] || null,
        period: {
          start: startDate,
          end: endDate,
          months: monthsBack
        }
      };

      // Add percentage to each payer
      const payersWithPercentage = payerReport.map(payer => ({
        ...payer,
        percentage: totalSpent > 0 
          ? Math.round((payer.totalAmount / totalSpent) * 10000) / 100 
          : 0
      }));

      logger.info('Payer report generated', {
        userId,
        period,
        summary: {
          payers: summary.totalPayers,
          totalSpent: summary.totalSpent
        }
      });

      res.json({
        success: true,
        data: {
          summary,
          payers: payersWithPercentage,
          meta: {
            generatedAt: new Date().toISOString(),
            reportType: 'payer_report',
            period,
            userId
          }
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Payer report generation failed', error as Error, {
        userId: req.user?.id,
        query: req.query
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar relatório de pagadores',
      } as ApiResponse);
    }
  }

  /**
   * Generate comprehensive dashboard report
   */
  static async dashboardReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const { period = 'current_month' } = req.query;

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date, endDate: Date;

      switch (period) {
        case 'current_month':
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
          break;
        case 'last_month':
          const lastMonth = subMonths(now, 1);
          startDate = startOfMonth(lastMonth);
          endDate = endOfMonth(lastMonth);
          break;
        case '3months':
          startDate = subMonths(startOfMonth(now), 2);
          endDate = endOfMonth(now);
          break;
        case '6months':
          startDate = subMonths(startOfMonth(now), 5);
          endDate = endOfMonth(now);
          break;
        default:
          startDate = startOfMonth(now);
          endDate = endOfMonth(now);
      }

      // Get comprehensive dashboard data
      const [
        totalExpenses,
        totalPayments,
        categoryCount,
        payerCount,
        payments,
        upcomingPayments
      ] = await Promise.all([
        // Total active expenses
        prisma.expense.count({
          where: { userId, active: true }
        }),

        // Total payments in period
        prisma.expensePayment.count({
          where: {
            dueDate: { gte: startDate, lte: endDate },
            expense: { userId }
          }
        }),

        // Total categories
        prisma.category.count({
          where: { userId }
        }),

        // Total active payers
        prisma.payer.count({
          where: { userId, active: true }
        }),

        // Payments in period with details
        prisma.expensePayment.findMany({
          where: {
            dueDate: { gte: startDate, lte: endDate },
            expense: { userId }
          },
          include: {
            expense: {
              include: {
                category: { select: { name: true, color: true } },
                buyer: { select: { name: true, color: true } }
              }
            }
          },
          orderBy: { dueDate: 'desc' }
        }),

        // Upcoming payments (next 30 days)
        prisma.expensePayment.findMany({
          where: {
            dueDate: {
              gte: now,
              lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            },
            expense: { userId },
            status: { in: ['PENDING', 'FUTURE'] }
          },
          include: {
            expense: {
              include: {
                category: { select: { name: true, icon: true, color: true } },
                buyer: { select: { name: true, color: true } }
              }
            }
          },
          orderBy: { dueDate: 'asc' },
          take: 10
        })
      ]);

      // Calculate financial summary
      const totalAmount = payments.reduce((sum, payment) => 
        sum + payment.amount.toNumber(), 0
      );

      const paidAmount = payments
        .filter(p => p.status === 'PAID')
        .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);

      const pendingAmount = payments
        .filter(p => p.status === 'PENDING')
        .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);

      const overdueAmount = payments
        .filter(p => p.status === 'OVERDUE')
        .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);

      // Category breakdown
      const categoryBreakdown = new Map<string, { amount: number; color: string; count: number }>();
      payments.forEach(payment => {
        const categoryName = payment.expense.category.name;
        const categoryColor = payment.expense.category.color;
        const amount = payment.amount.toNumber();
        
        const existing = categoryBreakdown.get(categoryName) || { 
          amount: 0, 
          color: categoryColor, 
          count: 0 
        };
        
        categoryBreakdown.set(categoryName, {
          amount: existing.amount + amount,
          color: categoryColor,
          count: existing.count + 1
        });
      });

      const topCategories = Array.from(categoryBreakdown.entries())
        .map(([name, data]) => ({
          name,
          amount: Math.round(data.amount * 100) / 100,
          color: data.color,
          count: data.count,
          percentage: totalAmount > 0 
            ? Math.round((data.amount / totalAmount) * 10000) / 100 
            : 0
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Payer breakdown
      const payerBreakdown = new Map<string, { amount: number; color: string; count: number }>();
      payments.forEach(payment => {
        const payerName = payment.expense.buyer.name;
        const payerColor = payment.expense.buyer.color;
        const amount = payment.amount.toNumber();
        
        const existing = payerBreakdown.get(payerName) || { 
          amount: 0, 
          color: payerColor, 
          count: 0 
        };
        
        payerBreakdown.set(payerName, {
          amount: existing.amount + amount,
          color: payerColor,
          count: existing.count + 1
        });
      });

      const topPayers = Array.from(payerBreakdown.entries())
        .map(([name, data]) => ({
          name,
          amount: Math.round(data.amount * 100) / 100,
          color: data.color,
          count: data.count,
          percentage: totalAmount > 0 
            ? Math.round((data.amount / totalAmount) * 10000) / 100 
            : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Status distribution
      const statusDistribution = {
        paid: {
          amount: Math.round(paidAmount * 100) / 100,
          count: payments.filter(p => p.status === 'PAID').length,
          percentage: totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 10000) / 100 : 0
        },
        pending: {
          amount: Math.round(pendingAmount * 100) / 100,
          count: payments.filter(p => p.status === 'PENDING').length,
          percentage: totalAmount > 0 ? Math.round((pendingAmount / totalAmount) * 10000) / 100 : 0
        },
        overdue: {
          amount: Math.round(overdueAmount * 100) / 100,
          count: payments.filter(p => p.status === 'OVERDUE').length,
          percentage: totalAmount > 0 ? Math.round((overdueAmount / totalAmount) * 10000) / 100 : 0
        }
      };

      const report = {
        overview: {
          totalExpenses,
          totalPayments,
          categoryCount,
          payerCount,
          period: {
            start: startDate,
            end: endDate,
            description: format(startDate, 'MMMM yyyy', { locale: ptBR })
          }
        },
        financial: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          paidAmount: Math.round(paidAmount * 100) / 100,
          pendingAmount: Math.round(pendingAmount * 100) / 100,
          overdueAmount: Math.round(overdueAmount * 100) / 100,
          averagePayment: totalPayments > 0 
            ? Math.round((totalAmount / totalPayments) * 100) / 100 
            : 0
        },
        breakdown: {
          categories: topCategories,
          payers: topPayers,
          status: statusDistribution
        },
        upcoming: upcomingPayments.map(payment => ({
          id: payment.id,
          description: payment.expense.description,
          amount: payment.amount.toNumber(),
          dueDate: payment.dueDate,
          category: payment.expense.category,
          buyer: payment.expense.buyer,
          status: payment.status,
          daysUntilDue: Math.ceil(
            (payment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
        }))
      };

      logger.info('Dashboard report generated', {
        userId,
        period,
        summary: {
          totalAmount: report.financial.totalAmount,
          payments: totalPayments,
          upcoming: upcomingPayments.length
        }
      });

      res.json({
        success: true,
        data: report,
        meta: {
          generatedAt: new Date().toISOString(),
          reportType: 'dashboard_report',
          period,
          userId
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Dashboard report generation failed', error as Error, {
        userId: req.user?.id,
        query: req.query
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar relatório do dashboard',
      } as ApiResponse);
    }
  }

  /**
   * Generate financial summary report
   */
  static async financialSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const currentMonth = startOfMonth(now);
      const lastMonth = startOfMonth(subMonths(now, 1));
      const last12Months = subMonths(currentMonth, 11);

      // Get monthly trends for the last 12 months
      const monthlyData = await prisma.expensePayment.groupBy({
        by: ['month', 'year'],
        where: {
          expense: { userId },
          year: { gte: last12Months.getFullYear() },
          OR: [
            { year: { gt: last12Months.getFullYear() } },
            { 
              year: last12Months.getFullYear(),
              month: { gte: last12Months.getMonth() + 1 }
            }
          ]
        },
        _sum: {
          amount: true
        },
        _count: {
          id: true
        },
        orderBy: [
          { year: 'asc' },
          { month: 'asc' }
        ]
      });

      // Format monthly trends
      const monthlyTrends = monthlyData.map(data => ({
        period: `${data.year}-${data.month.toString().padStart(2, '0')}`,
        year: data.year,
        month: data.month,
        totalAmount: data._sum.amount?.toNumber() || 0,
        paymentCount: data._count.id,
        averagePayment: data._count.id > 0 
          ? Math.round(((data._sum.amount?.toNumber() || 0) / data._count.id) * 100) / 100
          : 0
      }));

      // Calculate growth rates
      const currentMonthData = monthlyTrends.find(m => 
        m.year === now.getFullYear() && m.month === now.getMonth() + 1
      );
      const lastMonthData = monthlyTrends.find(m => 
        m.year === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()) && 
        m.month === (now.getMonth() === 0 ? 12 : now.getMonth())
      );

      const monthOverMonthGrowth = lastMonthData && currentMonthData
        ? ((currentMonthData.totalAmount - lastMonthData.totalAmount) / lastMonthData.totalAmount) * 100
        : 0;

      // Calculate averages
      const averageMonthlySpending = monthlyTrends.length > 0
        ? monthlyTrends.reduce((sum, month) => sum + month.totalAmount, 0) / monthlyTrends.length
        : 0;

      const totalSpending = monthlyTrends.reduce((sum, month) => sum + month.totalAmount, 0);
      const totalPayments = monthlyTrends.reduce((sum, month) => sum + month.paymentCount, 0);

      // Expense type breakdown
      const typeBreakdown = await prisma.expense.groupBy({
        by: ['type'],
        where: {
          userId,
          active: true
        },
        _sum: {
          totalAmount: true
        },
        _count: {
          id: true
        }
      });

      const expenseTypes = typeBreakdown.map(type => ({
        type: type.type,
        totalAmount: type._sum.totalAmount?.toNumber() || 0,
        expenseCount: type._count.id,
        percentage: totalSpending > 0 
          ? Math.round(((type._sum.totalAmount?.toNumber() || 0) / totalSpending) * 10000) / 100
          : 0
      }));

      const summary = {
        period: {
          start: last12Months,
          end: now,
          months: 12
        },
        totals: {
          spending: Math.round(totalSpending * 100) / 100,
          payments: totalPayments,
          averageMonthly: Math.round(averageMonthlySpending * 100) / 100,
          averagePayment: totalPayments > 0 
            ? Math.round((totalSpending / totalPayments) * 100) / 100 
            : 0
        },
        growth: {
          monthOverMonth: Math.round(monthOverMonthGrowth * 100) / 100,
          trend: monthOverMonthGrowth > 0 ? 'increase' : monthOverMonthGrowth < 0 ? 'decrease' : 'stable'
        },
        breakdown: {
          byType: expenseTypes,
          byMonth: monthlyTrends
        },
        insights: {
          highestSpendingMonth: monthlyTrends.reduce((max, month) => 
            month.totalAmount > max.totalAmount ? month : max, 
            monthlyTrends[0] || { totalAmount: 0, period: 'N/A' }
          ),
          lowestSpendingMonth: monthlyTrends.reduce((min, month) => 
            month.totalAmount < min.totalAmount ? month : min, 
            monthlyTrends[0] || { totalAmount: Infinity, period: 'N/A' }
          ),
          mostCommonExpenseType: expenseTypes.reduce((max, type) => 
            type.expenseCount > max.expenseCount ? type : max,
            expenseTypes[0] || { expenseCount: 0, type: 'N/A' }
          )
        }
      };

      logger.info('Financial summary generated', {
        userId,
        summary: {
          totalSpending: summary.totals.spending,
          months: summary.period.months,
          growth: summary.growth.monthOverMonth
        }
      });

      res.json({
        success: true,
        data: summary,
        meta: {
          generatedAt: new Date().toISOString(),
          reportType: 'financial_summary',
          userId
        }
      } as ApiResponse);

    } catch (error) {
      logger.error('Financial summary generation failed', error as Error, {
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        message: 'Erro interno ao gerar resumo financeiro',
      } as ApiResponse);
    }
  }
}

export default ReportController;