import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest, ApiResponse, CreateCategoryRequest, CreateSubcategoryRequest } from '../types';
import { schemas } from '../schemas';

const prisma = new PrismaClient();

/**
 * Category Controller
 */
export class CategoryController {
  /**
   * Get all categories with subcategories
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

      const categories = await prisma.category.findMany({
        where: { userId },
        include: {
          subcategories: {
            orderBy: { name: 'asc' },
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
        data: categories,
      } as ApiResponse);
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get category by ID
   */
  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const categoryId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
        include: {
          subcategories: {
            orderBy: { name: 'asc' },
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

      if (!category) {
        res.status(404).json({
          success: false,
          message: 'Categoria não encontrada',
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: category,
      } as ApiResponse);
    } catch (error) {
      console.error('Get category by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Create new category
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
      const validation = schemas.category.create.safeParse(req.body);
      
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

      const categoryData: CreateCategoryRequest = validation.data;

      // Check if category name already exists for this user
      const existingCategory = await prisma.category.findFirst({
        where: {
          userId,
          name: {
            equals: categoryData.name,
            mode: 'insensitive',
          },
        },
      });

      if (existingCategory) {
        res.status(409).json({
          success: false,
          message: 'Já existe uma categoria com este nome',
        } as ApiResponse);
        return;
      }

      // Create category
      const category = await prisma.category.create({
        data: {
          name: categoryData.name,
          icon: categoryData.icon,
          color: categoryData.color,
          userId,
        },
        include: {
          subcategories: true,
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
        message: 'Categoria criada com sucesso',
        data: category,
      } as ApiResponse);
    } catch (error) {
      console.error('Create category error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update category
   */
  static async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const categoryId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.category.update.safeParse(req.body);
      
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

      // Check if category exists and belongs to user
      const existingCategory = await prisma.category.findFirst({
        where: { id: categoryId, userId },
      });

      if (!existingCategory) {
        res.status(404).json({
          success: false,
          message: 'Categoria não encontrada',
        } as ApiResponse);
        return;
      }

      // Check if new name conflicts with existing categories
      if (updateData.name) {
        const nameConflict = await prisma.category.findFirst({
          where: {
            userId,
            id: { not: categoryId },
            name: {
              equals: updateData.name,
              mode: 'insensitive',
            },
          },
        });

        if (nameConflict) {
          res.status(409).json({
            success: false,
            message: 'Já existe uma categoria com este nome',
          } as ApiResponse);
          return;
        }
      }

      // Update category
      const updatedCategory = await prisma.category.update({
        where: { id: categoryId },
        data: updateData,
        include: {
          subcategories: {
            orderBy: { name: 'asc' },
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
        message: 'Categoria atualizada com sucesso',
        data: updatedCategory,
      } as ApiResponse);
    } catch (error) {
      console.error('Update category error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Delete category
   */
  static async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const categoryId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if category exists and belongs to user
      const category = await prisma.category.findFirst({
        where: { id: categoryId, userId },
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

      if (!category) {
        res.status(404).json({
          success: false,
          message: 'Categoria não encontrada',
        } as ApiResponse);
        return;
      }

      // Check if category has active expenses
      if (category._count.expenses > 0) {
        res.status(400).json({
          success: false,
          message: 'Não é possível excluir categoria que possui despesas ativas',
          data: {
            expenseCount: category._count.expenses,
          },
        } as ApiResponse);
        return;
      }

      // Delete category (cascading delete will handle subcategories)
      await prisma.category.delete({
        where: { id: categoryId },
      });

      res.json({
        success: true,
        message: 'Categoria excluída com sucesso',
      } as ApiResponse);
    } catch (error) {
      console.error('Delete category error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Get category usage statistics
   */
  static async getUsageStats(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Get category usage statistics
      const categoryStats = await prisma.expensePayment.groupBy({
        by: ['expenseId'],
        where: {
          month: currentMonth,
          year: currentYear,
          expense: {
            userId,
            active: true,
          },
        },
        _sum: {
          amount: true,
        },
        _count: {
          expenseId: true,
        },
      });

      // Get expense details to group by category
      const expenseIds = categoryStats.map(stat => stat.expenseId);
      
      if (expenseIds.length === 0) {
        res.json({
          success: true,
          data: [],
        } as ApiResponse);
        return;
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
              icon: true,
              color: true,
            },
          },
        },
      });

      // Group by category
      const categoryUsage = new Map<string, {
        category: any;
        totalAmount: number;
        expenseCount: number;
        averageAmount: number;
      }>();

      for (const expense of expenses) {
        const stat = categoryStats.find(s => s.expenseId === expense.id);
        const amount = stat?._sum.amount?.toNumber() || 0;

        if (!categoryUsage.has(expense.category.id)) {
          categoryUsage.set(expense.category.id, {
            category: expense.category,
            totalAmount: 0,
            expenseCount: 0,
            averageAmount: 0,
          });
        }

        const usage = categoryUsage.get(expense.category.id)!;
        usage.totalAmount += amount;
        usage.expenseCount += 1;
        usage.averageAmount = usage.totalAmount / usage.expenseCount;
      }

      // Convert to array and sort by total amount
      const usageStats = Array.from(categoryUsage.values())
        .map(usage => ({
          ...usage,
          totalAmount: Math.round(usage.totalAmount * 100) / 100,
          averageAmount: Math.round(usage.averageAmount * 100) / 100,
        }))
        .sort((a, b) => b.totalAmount - a.totalAmount);

      res.json({
        success: true,
        data: {
          period: { month: currentMonth, year: currentYear },
          categories: usageStats,
          totalCategories: usageStats.length,
        },
      } as ApiResponse);
    } catch (error) {
      console.error('Get category usage stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  // Subcategory methods

  /**
   * Create subcategory
   */
  static async createSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      const validation = schemas.category.createSubcategory.safeParse(req.body);
      
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

      const subcategoryData: CreateSubcategoryRequest = validation.data;

      // Verify that category belongs to user
      const category = await prisma.category.findFirst({
        where: { id: subcategoryData.categoryId, userId },
      });

      if (!category) {
        res.status(404).json({
          success: false,
          message: 'Categoria não encontrada',
        } as ApiResponse);
        return;
      }

      // Check if subcategory name already exists in this category
      const existingSubcategory = await prisma.subcategory.findFirst({
        where: {
          categoryId: subcategoryData.categoryId,
          name: {
            equals: subcategoryData.name,
            mode: 'insensitive',
          },
        },
      });

      if (existingSubcategory) {
        res.status(409).json({
          success: false,
          message: 'Já existe uma subcategoria com este nome nesta categoria',
        } as ApiResponse);
        return;
      }

      // Create subcategory
      const subcategory = await prisma.subcategory.create({
        data: subcategoryData,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
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
        message: 'Subcategoria criada com sucesso',
        data: subcategory,
      } as ApiResponse);
    } catch (error) {
      console.error('Create subcategory error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Update subcategory
   */
  static async updateSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const subcategoryId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Validate request body
      const validation = schemas.category.updateSubcategory.safeParse(req.body);
      
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

      // Check if subcategory exists and user owns the parent category
      const existingSubcategory = await prisma.subcategory.findFirst({
        where: {
          id: subcategoryId,
          category: { userId },
        },
        include: {
          category: true,
        },
      });

      if (!existingSubcategory) {
        res.status(404).json({
          success: false,
          message: 'Subcategoria não encontrada',
        } as ApiResponse);
        return;
      }

      // Check if new name conflicts within the same category
      if (updateData.name) {
        const nameConflict = await prisma.subcategory.findFirst({
          where: {
            categoryId: existingSubcategory.categoryId,
            id: { not: subcategoryId },
            name: {
              equals: updateData.name,
              mode: 'insensitive',
            },
          },
        });

        if (nameConflict) {
          res.status(409).json({
            success: false,
            message: 'Já existe uma subcategoria com este nome nesta categoria',
          } as ApiResponse);
          return;
        }
      }

      // Update subcategory
      const updatedSubcategory = await prisma.subcategory.update({
        where: { id: subcategoryId },
        data: updateData,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
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
        message: 'Subcategoria atualizada com sucesso',
        data: updatedSubcategory,
      } as ApiResponse);
    } catch (error) {
      console.error('Update subcategory error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }

  /**
   * Delete subcategory
   */
  static async deleteSubcategory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      const subcategoryId = req.params.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Usuário não autenticado',
        } as ApiResponse);
        return;
      }

      // Check if subcategory exists and user owns the parent category
      const subcategory = await prisma.subcategory.findFirst({
        where: {
          id: subcategoryId,
          category: { userId },
        },
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

      if (!subcategory) {
        res.status(404).json({
          success: false,
          message: 'Subcategoria não encontrada',
        } as ApiResponse);
        return;
      }

      // Check if subcategory has active expenses
      if (subcategory._count.expenses > 0) {
        res.status(400).json({
          success: false,
          message: 'Não é possível excluir subcategoria que possui despesas ativas',
          data: {
            expenseCount: subcategory._count.expenses,
          },
        } as ApiResponse);
        return;
      }

      // Delete subcategory
      await prisma.subcategory.delete({
        where: { id: subcategoryId },
      });

      res.json({
        success: true,
        message: 'Subcategoria excluída com sucesso',
      } as ApiResponse);
    } catch (error) {
      console.error('Delete subcategory error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      } as ApiResponse);
    }
  }
}

export default CategoryController;