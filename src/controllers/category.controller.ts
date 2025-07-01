import { Request, Response } from 'express';

export class CategoryController {
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const categories = [
        { id: '1', name: 'Alimentação', icon: '🍔', color: '#FF6B6B' },
        { id: '2', name: 'Transporte', icon: '🚗', color: '#45B7D1' },
        { id: '3', name: 'Moradia', icon: '🏠', color: '#96CEB4' },
        { id: '4', name: 'Saúde', icon: '⚕️', color: '#FECA57' },
        { id: '5', name: 'Educação', icon: '📚', color: '#A29BFE' }
      ];

      res.status(200).json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}