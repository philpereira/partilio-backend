declare const process: {
  env: { [key: string]: string | undefined };
  uptime: () => number;
};

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
};