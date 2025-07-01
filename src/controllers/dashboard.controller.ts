import { Request, Response } from 'express';

export class DashboardController {
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboardData = {
        summary: {
          totalExpenses: 1250.75,
          totalPaid: 850.25,
          totalPending: 400.50,
          totalOverdue: 0.00,
          monthlyAverage: 625.38
        },
        categoryBreakdown: [
          { categoryId: '1', categoryName: 'Alimentação', totalAmount: 450.25, percentage: 36 },
          { categoryId: '2', categoryName: 'Transporte', totalAmount: 320.50, percentage: 26 },
          { categoryId: '3', categoryName: 'Moradia', totalAmount: 280.00, percentage: 22 },
          { categoryId: '4', categoryName: 'Saúde', totalAmount: 150.00, percentage: 12 },
          { categoryId: '5', categoryName: 'Outros', totalAmount: 50.00, percentage: 4 }
        ],
        upcomingDues: [
          {
            id: '1',
            description: 'Conta de luz',
            amount: 120.50,
            dueDate: '2025-01-15',
            daysUntilDue: 2
          },
          {
            id: '2',
            description: 'Internet',
            amount: 89.90,
            dueDate: '2025-01-18',
            daysUntilDue: 5
          }
        ],
        trends: {
          monthlyComparison: {
            currentMonth: 1250.75,
            previousMonth: 1180.30,
            percentageChange: 5.97
          }
        }
      };

      res.status(200).json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      console.error('Get dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}