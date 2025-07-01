import { Express } from 'express';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string;
      PORT?: string;
      DATABASE_URL?: string;
      JWT_SECRET?: string;
      JWT_EXPIRES_IN?: string;
      CORS_ORIGIN?: string;
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      name?: string;
    };
  }
}

export {};
