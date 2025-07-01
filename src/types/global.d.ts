// Declarações globais para resolver erros de tipos

declare global {
  // Process global
  const process: {
    env: { [key: string]: string | undefined };
    exit: (code?: number) => never;
    cwd: () => string;
    argv: string[];
    platform: string;
    version: string;
  };

  // Console global
  const console: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    info: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };
}

// Express types extensions
declare namespace Express {
  interface Request {
    user?: any;
    userId?: string;
    file?: any;
    files?: any;
    params: any;
    query: any;
    body: any;
    headers: any;
  }
}

// AuthenticatedRequest type
declare interface AuthenticatedRequest extends Express.Request {
  user: any;
  userId: string;
  params: any;
  query: any;
  body: any;
  headers: any;
  file?: any;
  files?: any;
}

// ApiResponse type
declare interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  metadata?: any;
}

// Tipos básicos que podem estar faltando
declare type CreateCategoryRequest = any;
declare type CreateSubcategoryRequest = any;
declare type CreateCreditCardRequest = any;
declare type CreateExpenseRequest = any;
declare type UpdateExpenseRequest = any;
declare type ExpenseFilters = any;
declare type PaginationParams = any;
declare type CreatePayerRequest = any;
declare type PayerData = any;
declare type DashboardData = any;
declare type PeriodParams = any;

export {};
