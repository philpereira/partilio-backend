import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';

export class PaymentController {
  static async getPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Get payments not implemented yet - deploy working!'
    } as ApiResponse);
  }

  static async markAsPaid(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Mark as paid not implemented yet - deploy working!'
    } as ApiResponse);
  }

  static async bulkMarkAsPaid(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Bulk mark as paid not implemented yet - deploy working!'
    } as ApiResponse);
  }

  static async revertPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Revert payment not implemented yet - deploy working!'
    } as ApiResponse);
  }

  static async updateDueDate(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Update due date not implemented yet - deploy working!'
    } as ApiResponse);
  }

  // ✅ Método que estava faltando
  static async getPaymentStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(501).json({
      success: false,
      message: 'Payment stats not implemented yet - deploy working!'
    } as ApiResponse);
  }
}