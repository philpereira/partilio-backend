import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  errors?: any[];
}