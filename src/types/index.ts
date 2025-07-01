// Tipos principais do sistema
export interface AuthenticatedRequest {
  user: any;
  userId: string;
  params: any;
  query: any;
  body: any;
  headers: any;
  file?: any;
  files?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  metadata?: any;
}

export type CreateCategoryRequest = any;
export type CreateSubcategoryRequest = any;
export type CreateCreditCardRequest = any;
export type CreateExpenseRequest = any;
export type UpdateExpenseRequest = any;
export type ExpenseFilters = any;
export type PaginationParams = any;
export type CreatePayerRequest = any;
export type PayerData = any;
export type DashboardData = any;
export type PeriodParams = any;
