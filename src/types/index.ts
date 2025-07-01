import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateExpenseRequest {
  description: string;
  supplier?: string;
  amount: number;
  categoryId?: string;
  payerId?: string;
  dueDate?: string;
  notes?: string;
}

export interface UpdateExpenseRequest {
  description?: string;
  supplier?: string;
  amount?: number;
  categoryId?: string;
  payerId?: string;
  dueDate?: string;
  notes?: string;
  active?: boolean;
}

export interface ExpenseFilters {
  search?: string;
  categoryId?: string;
  payerId?: string;
  status?: string[];
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  active?: boolean;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}