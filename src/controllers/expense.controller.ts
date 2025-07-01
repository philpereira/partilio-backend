import { Response } from 'express';
import { PrismaClient, ExpenseType, ExpensePaymentStatus } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse, CreateExpenseRequest, UpdateExpenseRequest, ExpenseFilters, PaginationParams } from '../types';
import { schemas } from '../schemas';
import { FinancialUtils, DateUtils } from '../utils/financial';

const prisma = new PrismaClient();

/**
 * Expense Controller
 */
export class ExpenseController {
  /**
   * Create new expense
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
      const validation = schemas.expense.create.safeParse(req.body);
      
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

      const expenseData: CreateExpenseRequest = validation.data;

      // Verify that referenced entities belong to the user
      const [buyer, payer, category, subcategory, creditCard] = await Promise.all([
        prisma.payer.findFirst({
          where: { id: expenseData.buyerId, userId, active: true },
        }),
        expenseData.payerId ? prisma.payer.findFirst({
          where: { id: expenseData.payerId, userId, active: true },
        }) : null,
        prisma.category.findFirst({
          where: { id: expenseData.categoryId, userId },
        }),
        expenseData.subcategoryId ? prisma.subcategory.findFirst({
          where: { id: expenseData.subcategoryId, categoryId: expenseData.categoryId },
        }) : null,
        expenseData.creditCardId ? prisma.creditCard.findFirst({
          where: { id: expenseData.creditCardId, userId, active: true },
        }) : null,
      ]);

      if (!buyer) {
        res.status(400).json({
          success: false,
          message: 'Comprador não encontrado',
        } as ApiResponse);
        return;
      }

      if (expenseData.payerId && !payer) {
        res.status(400).json({
          success: false,
          message: 'Pagador não encontrado',
        } as ApiResponse);
        return;
      }

      if (!category) {
        res.status(400).json({
          success: false,
          message: 'Categoria não encontrada',
        } as ApiResponse);
        return;
      }

      if (expenseData.subcategoryId && !subcategory) {
        res.status(400).json({
          success: false,
          message: 'Subcategoria não encontrada',
        } as ApiResponse);
        return;
      }

      if (expenseData.creditCardId && !creditCard) {
        res.status(400).json({
          success: false,
          message: 'Cartão de crédito não encontrado',
        } as ApiResponse);
        return;
      }

      // Validate splits if divided
      if (expenseData.isDivided && expenseData.splits) {
        // Verify that all payers in splits belong to the user
        const splitPayerIds = expenseData.splits.map(split => split.payerId);
        const validPayers = await prisma.payer.findMany({
          where: { id: { in: splitPayerIds }, userId, active: true },
          select: { id: true },
        });

        if (validPayers.length !== splitPayerIds.length) {
          res.status(400).json({
            success: false,
            message: 'Um ou mais pagadores na divisão não são válidos',
          } as ApiResponse);
          return;
        }

        // Validate split percentages
        const splitValidation = FinancialUtils.validateSplits(expenseData.splits);
        if (!splitValidation.isValid) {
          res.status(400).json({
            success: false,
            message: splitValidation.message,
          } as ApiResponse);
          return;
        }
      }

      // Calculate amounts
      let calculatedTotalAmount = expenseData.totalAmount;
      let calculatedInstallmentAmount = expenseData.installmentAmount || expenseData.totalAmount;

      if (expenseData.isInstallment && expenseData.numberOfInstallments) {
        if (expenseData.installmentAmount) {
          calculatedTotalAmount = FinancialUtils.calculateTotalAmount(
            expenseData.installmentAmount,
            expenseData.numberOfInstallments
          );
        } else {
          calculatedInstallmentAmount = FinancialUtils.calculateInstallmentAmount(
            expenseData.totalAmount,
            expenseData.numberOfInstallments
          );
        }
      }

      // Create expense in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create expense
        const expense = await tx.expense.create({
          data: {
            description: expenseData.description,
            supplier: expenseData.supplier,
            type: expenseData.type,
            totalAmount: calculatedTotalAmount,
            installmentAmount: calculatedInstallmentAmount,
            numberOfMonths: expenseData.numberOfMonths,
            startDate: new Date(expenseData.startDate),
            dueDate: expenseData.dueDate,
            purchaseDate: expenseData.purchaseDate ? new Date(expenseData.purchaseDate) : null,
            isInstallment: expenseData.isInstallment || false,
            numberOfInstallments: expenseData.numberOfInstallments,
            buyerId: expenseData.buyerId,
            payerId: expenseData.payerId,
            isDivided: expenseData.isDivided,
            notes: expenseData.notes,
            userId,
            categoryId: expenseData.categoryId,
            subcategoryId: expenseData.subcategoryId,
            creditCardId: expenseData.creditCardId,
          },
          include: {
            buyer: {
              select: {
                id: true,
                name: true,
                color: true,
                active: true,
              },
            },
            payer: expenseData.payerId ? {
              select: {
                id: true,
                name: true,
                color: true,
                active: true,
              },
            } : undefined,
            category: {
              select: {
                id: true,
                name: true,
                icon: true,
                color: true,
              },
            },
            subcategory: expenseData.subcategoryId ? {
              select: {
                id: true,
                name: true,
                icon: true,
              },
            } : undefined,
            creditCard: expenseData.creditCardId ? {
              select: {
                id: true,
                name: true,
                holder: true,
                closingDay: true,
                dueDay: true,
              },
            } : undefined,
          },
        });

        // Create splits if divided
        if (expenseData.isDivided && expenseData.splits) {
          const splitCalculations = FinancialUtils.calculateSplits(
            calculatedInstallmentAmount,
            expenseData.splits
          );

          await Promise.all(
            splitCalculations.map(split =>
              tx.expenseSplit.create({
                data: {
                  expenseId: expense.id,
                  payerId: split.payerId,
                  percentage: split.percentage,
                  amount: split.amount,
                },
              })
            )
          );
        }

        // Generate payment schedule
        let paymentSchedule: Array<{ month: number; year: number; dueDate: Date }> = [];

        if (expense.type === ExpenseType.CARTAO_CREDITO && creditCard) {
          // For credit card expenses, calculate due dates based on purchase date
          const purchaseDate = expense.purchaseDate || expense.startDate;
          const numberOfPayments = expense.numberOfInstallments || 1;

          for (let i = 0; i < numberOfPayments; i++) {
            const paymentDate = new Date(purchaseDate);
            paymentDate.setMonth(paymentDate.getMonth() + i);
            
            const dueDate = DateUtils.calculateCreditCardDueDate(
              paymentDate,
              creditCard.closingDay,
              creditCard.dueDay
            );

            paymentSchedule.push({
              month: dueDate.getMonth() + 1,
              year: dueDate.getFullYear(),
              dueDate,
            });
          }
        } else {
          // For other expense types, use recurring schedule
          const numberOfPayments = expense.numberOfMonths || 
            expense.numberOfInstallments || 
            (expense.type === ExpenseType.RECORRENTE_FIXA || expense.type === ExpenseType.RECORRENTE_VARIAVEL ? 12 : 1);

          paymentSchedule = DateUtils.generatePaymentSchedule(
            expense.startDate,
            expense.dueDate,
            numberOfPayments
          );
        }

        // Create payment records
        await Promise.all(
          paymentSchedule.map(payment =>
            tx.expensePayment.create({
              data: {
                expenseId: expense.id,
                month: payment.month,
                year: payment.year,
                amount: calculatedInstallmentAmount,
                dueDate: payment.dueDate,
                status: ExpensePaymentStatus.PENDING,
              },
            })
          )
        );

        return expense;
      });

      // Fetch complete expense data
      const completeExpense = await this.getExpenseById(result.id, userId);

      res.status(201).json({
        success: true,
        message: 'Despesa criada com sucesso',
        data: completeExpense,
      } as ApiResponse);
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get expenses with filters and pagination
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

      // Parse query parameters
      const filtersValidation = schemas.expense.filters.safeParse(req.query);
      const paginationValidation = schemas.pagination.safeParse({
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
      });

      if (!filtersValidation.success || !paginationValidation.success) {
        res.status(400).json({
          success: false,
          message: 'Parâmetros inválidos',
          errors: [
            ...(filtersValidation.error?.errors || []),
            ...(paginationValidation.error?.errors || []),
          ].map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        } as ApiResponse);
        return;
      }

      const filters: ExpenseFilters = filtersValidation.data;
      const pagination: PaginationParams = paginationValidation.data;

      // Build where clause
      const where: any = {
        userId,
        active: filters.active !== undefined ? filters.active : true,
      };

      if (filters.paused !== undefined) {
        where.paused = filters.paused;
      }

      if (filters.search) {
        where.OR = [
          { description: { contains: filters.search, mode: 'insensitive' } },
          { supplier: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      if (filters.categoryId) {
        where.categoryId = filters.categoryId;
      }

      if (filters.subcategoryId) {
        where.subcategoryId = filters.subcategoryId;
      }

      if (filters.type && filters.type.length > 0) {
        where.type = { in: filters.type };
      }

      if (filters.creditCardId) {
        where.creditCardId = filters.creditCardId;
      }

      if (filters.suppliers && filters.suppliers.length > 0) {
        where.supplier = { in: filters.suppliers };
      }

      if (filters.minAmount || filters.maxAmount) {
        where.installmentAmount = {};
        if (filters.minAmount) where.installmentAmount.gte = filters.minAmount;
        if (filters.maxAmount) where.installmentAmount.lte = filters.maxAmount;
      }

      if (filters.startDate || filters.endDate) {
        where.startDate = {};
        if (filters.startDate) where.startDate.gte = new Date(filters.startDate);
        if (filters.endDate) where.startDate.lte = new Date(filters.endDate);
      }

      // Handle payer filter
      if (filters.payerId) {
        where.OR = [
          { payerId: filters.payerId },
          { 
            isDivided: true,
            splits: { some: { payerId: filters.payerId } }
          },
        ];
      }

      // Build order clause
      const orderBy: any = {};
      
      switch (pagination.sortBy) {
        case 'amount':
          orderBy.installmentAmount = pagination.sortOrder;
          break;
        case 'description':
          orderBy.description = pagination.sortOrder;
          break;
        case 'supplier':
          orderBy.supplier = pagination.sortOrder;
          break;
        case 'startDate':
          orderBy.startDate = pagination.sortOrder;
          break;
        default:
          orderBy.createdAt = pagination.sortOrder;
      }

      // Get total count
      const total = await prisma.expense.count({ where });

      // Get expenses
      const expenses = await prisma.expense.findMany({
        where,
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
          payer: {
            select: {
              id: true,
              name: true,
              color: true,
              active: true,
            },
          },
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
          creditCard: {
            select: {
              id: true,
              name: true,
              holder: true,
              closingDay: true,
              dueDay: true,
            },
          },
          splits: {
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
          },
          payments: {
            where: filters.month && filters.year ? {
              month: filters.month,
              year: filters.year,
            } : undefined,
            orderBy: { dueDate: 'asc' },
          },
        },
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

      // Filter by payment status if specified
      let filteredExpenses = expenses;
      if (filters.status && filters.status.length > 0) {
        filteredExpenses = expenses.filter(expense => 
          expense.payments.some(payment => filters.status!.includes(payment.status))
        );
      }

      const totalPages = Math.ceil(total / pagination.limit);

      res.json({
        success: true,
        data: filteredExpenses,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          totalPages,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get expenses error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get expense by ID
   */
  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const expenseId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const expense = await this.getExpenseById(expenseId, userId);

      if (!expense) {
        res.status(404).json({
          success: false,
          message: 'Despesa não encontrada',
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: expense,
      } as ApiResponse);
    } catch (error) {
      console.error('Get expense by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update expense
   */
  static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const expenseId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.expense.update.safeParse(req.body);
      
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

      const updateData: UpdateExpenseRequest = validation.data;

      // Check if expense exists and belongs to user
      const existingExpense = await prisma.expense.findFirst({
        where: { id: expenseId, userId },
        include: { splits: true, payments: true },
      });

      if (!existingExpense) {
        res.status(404).json({
          success: false,
          message: 'Despesa não encontrada',
        } as ApiResponse);
        return;
      }

      // Build update data
      const updateFields: any = {};
      
      if (updateData.description !== undefined) updateFields.description = updateData.description;
      if (updateData.supplier !== undefined) updateFields.supplier = updateData.supplier;
      if (updateData.totalAmount !== undefined) updateFields.totalAmount = updateData.totalAmount;
      if (updateData.installmentAmount !== undefined) updateFields.installmentAmount = updateData.installmentAmount;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.active !== undefined) updateFields.active = updateData.active;
      if (updateData.paused !== undefined) updateFields.paused = updateData.paused;

      // Update expense in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update basic expense data
        const updatedExpense = await tx.expense.update({
          where: { id: expenseId },
          data: updateFields,
        });

        // Update splits if provided
        if (updateData.splits && updateData.isDivided) {
          // Delete existing splits
          await tx.expenseSplit.deleteMany({
            where: { expenseId },
          });

          // Create new splits
          const splitCalculations = FinancialUtils.calculateSplits(
            updateData.installmentAmount || existingExpense.installmentAmount.toNumber(),
            updateData.splits
          );

          await Promise.all(
            splitCalculations.map(split =>
              tx.expenseSplit.create({
                data: {
                  expenseId,
                  payerId: split.payerId,
                  percentage: split.percentage,
                  amount: split.amount,
                },
              })
            )
          );
        }

        return updatedExpense;
      });

      // Fetch updated expense data
      const updatedExpense = await this.getExpenseById(expenseId, userId);

      res.json({
        success: true,
        message: 'Despesa atualizada com sucesso',
        data: updatedExpense,
      } as ApiResponse);
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Delete expense
   */
  static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const expenseId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if expense exists and belongs to user
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

      // Delete expense (cascading delete will handle related records)
      await prisma.expense.delete({
        where: { id: expenseId },
      });

      res.json({
        success: true,
        message: 'Despesa excluída com sucesso',
      } as ApiResponse);
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Duplicate expense
   */
  static async duplicate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const expenseId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get original expense
      const originalExpense = await prisma.expense.findFirst({
        where: { id: expenseId, userId },
        include: { splits: true },
      });

      if (!originalExpense) {
        res.status(404).json({
          success: false,
          message: 'Despesa não encontrada',
        } as ApiResponse);
        return;
      }

      // Create duplicate
      const result = await prisma.$transaction(async (tx) => {
        // Calculate new start date (next month)
        const newStartDate = new Date(originalExpense.startDate);
        newStartDate.setMonth(newStartDate.getMonth() + 1);

        // Create new expense
        const duplicatedExpense = await tx.expense.create({
          data: {
            description: `${originalExpense.description} (Cópia)`,
            supplier: originalExpense.supplier,
            type: originalExpense.type,
            totalAmount: originalExpense.totalAmount,
            installmentAmount: originalExpense.installmentAmount,
            numberOfMonths: originalExpense.numberOfMonths,
            startDate: newStartDate,
            dueDate: originalExpense.dueDate,
            purchaseDate: originalExpense.purchaseDate ? new Date(originalExpense.purchaseDate) : null,
            isInstallment: originalExpense.isInstallment,
            numberOfInstallments: originalExpense.numberOfInstallments,
            buyerId: originalExpense.buyerId,
            payerId: originalExpense.payerId,
            isDivided: originalExpense.isDivided,
            notes: originalExpense.notes,
            userId,
            categoryId: originalExpense.categoryId,
            subcategoryId: originalExpense.subcategoryId,
            creditCardId: originalExpense.creditCardId,
          },
        });

        // Copy splits if divided
        if (originalExpense.isDivided && originalExpense.splits.length > 0) {
          await Promise.all(
            originalExpense.splits.map(split =>
              tx.expenseSplit.create({
                data: {
                  expenseId: duplicatedExpense.id,
                  payerId: split.payerId,
                  percentage: split.percentage,
                  amount: split.amount,
                },
              })
            )
          );
        }

        return duplicatedExpense;
      });

      // Fetch complete duplicated expense data
      const duplicatedExpense = await this.getExpenseById(result.id, userId);

      res.status(201).json({
        success: true,
        message: 'Despesa duplicada com sucesso',
        data: duplicatedExpense,
      } as ApiResponse);
    } catch (error) {
      console.error('Duplicate expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Toggle pause status
   */
  static async togglePause(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const expenseId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Get current expense
      const expense = await prisma.expense.findFirst({
        where: { id: expenseId, userId },
        select: { id: true, paused: true },
      });

      if (!expense) {
        res.status(404).json({
          success: false,
          message: 'Despesa não encontrada',
        } as ApiResponse);
        return;
      }

      // Toggle pause status
      const updatedExpense = await prisma.expense.update({
        where: { id: expenseId },
        data: { paused: !expense.paused },
      });

      res.json({
        success: true,
        message: expense.paused ? 'Despesa reativada com sucesso' : 'Despesa pausada com sucesso',
        data: { paused: updatedExpense.paused },
      } as ApiResponse);
    } catch (error) {
      console.error('Toggle pause error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Helper method to get complete expense data by ID
   */
  private static async getExpenseById(expenseId: string, userId: string) {
    return await prisma.expense.findFirst({
      where: { id: expenseId, userId },
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            color: true,
            active: true,
          },
        },
        payer: {
          select: {
            id: true,
            name: true,
            color: true,
            active: true,
          },
        },
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
        creditCard: {
          select: {
            id: true,
            name: true,
            holder: true,
            closingDay: true,
            dueDay: true,
            limit: true,
          },
        },
        splits: {
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
          orderBy: { percentage: 'desc' },
        },
        payments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });
  }
}

export default ExpenseController;