import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ExpenseRequest extends Request {
  user?: any;
}

export class ExpenseController {
  /**
   * Listar despesas
   */
  static async getAll(req: ExpenseRequest, res: Response): Promise<void> {
    try {
      // Por enquanto retornar dados mock, depois conectar com Prisma real
      const mockExpenses = [
        {
          id: '1',
          description: 'Supermercado',
          supplier: 'Carrefour',
          amount: 150.50,
          category: { id: '1', name: 'Alimentação', color: '#FF6B6B' },
          payer: { id: '1', name: 'João', color: '#4ECDC4' },
          dueDate: '2025-01-15',
          status: 'PENDING',
          createdAt: new Date().toISOString()
        },
        {
          id: '2',
          description: 'Combustível',
          supplier: 'Posto BR',
          amount: 80.00,
          category: { id: '2', name: 'Transporte', color: '#45B7D1' },
          payer: { id: '2', name: 'Maria', color: '#96CEB4' },
          dueDate: '2025-01-20',
          status: 'PAID',
          createdAt: new Date().toISOString()
        }
      ];

      res.status(200).json({
        success: true,
        data: mockExpenses,
        pagination: {
          page: 1,
          limit: 10,
          total: mockExpenses.length,
          totalPages: 1
        }
      });
    } catch (error) {
      console.error('Get expenses error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  /**
   * Criar despesa
   */
  static async create(req: ExpenseRequest, res: Response): Promise<void> {
    try {
      const { description, supplier, amount, categoryId, payerId } = req.body;

      if (!description || !amount) {
        res.status(400).json({
          success: false,
          message: 'Descrição e valor são obrigatórios'
        });
        return;
      }

      // Mock de criação - depois implementar Prisma real
      const newExpense = {
        id: Date.now().toString(),
        description,
        supplier: supplier || 'Não informado',
        amount: parseFloat(amount),
        category: { id: categoryId || '1', name: 'Geral', color: '#6C7CE7' },
        payer: { id: payerId || '1', name: 'Usuário', color: '#A8E6CF' },
        dueDate: new Date().toISOString().split('T')[0],
        status: 'PENDING',
        createdAt: new Date().toISOString()
      };

      res.status(201).json({
        success: true,
        message: 'Despesa criada com sucesso',
        data: newExpense
      });
    } catch (error) {
      console.error('Create expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  /**
   * Atualizar despesa
   */
  static async update(req: ExpenseRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { description, supplier, amount } = req.body;

      // Mock de atualização
      const updatedExpense = {
        id,
        description: description || 'Despesa atualizada',
        supplier: supplier || 'Fornecedor atualizado',
        amount: amount ? parseFloat(amount) : 100.00,
        category: { id: '1', name: 'Geral', color: '#6C7CE7' },
        payer: { id: '1', name: 'Usuário', color: '#A8E6CF' },
        dueDate: new Date().toISOString().split('T')[0],
        status: 'PENDING',
        updatedAt: new Date().toISOString()
      };

      res.status(200).json({
        success: true,
        message: 'Despesa atualizada com sucesso',
        data: updatedExpense
      });
    } catch (error) {
      console.error('Update expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  /**
   * Deletar despesa
   */
  static async delete(req: ExpenseRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      res.status(200).json({
        success: true,
        message: 'Despesa excluída com sucesso',
        data: { id }
      });
    } catch (error) {
      console.error('Delete expense error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}