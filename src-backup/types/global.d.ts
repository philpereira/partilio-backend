// Global declarations completas
declare global {
  const process: {
    env: { [key: string]: string | undefined };
    exit: (code?: number) => never;
    cwd: () => string;
    argv: string[];
    platform: string;
    version: string;
    uptime: () => number;
    on: (event: string, listener: Function) => any;
  };

  const console: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    info: (...args: any[]) => void;
    debug: (...args: any[]) => void;
  };

  function Number(value?: any): number;
  
  interface AuthenticatedRequest {
    user: any;
    userId: string;
    params: any;
    query: any;
    body: any;
    headers: any;
    file?: any;
    files?: any;
  }

  interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    metadata?: any;
  }
}

export {};
