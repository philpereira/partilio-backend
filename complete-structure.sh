#!/bin/bash

echo "🏗️ COMPLETANDO ESTRUTURA ROBUSTA - ARQUIVOS RESTANTES"
echo "====================================================="

# 1. Verificar e criar config/env.ts se não existir
if [ ! -f "src/config/env.ts" ]; then
    echo "📝 Criando config/env.ts..."
    mkdir -p src/config
    cat > src/config/env.ts << 'EOF'
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

let config: {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  isDevelopment: boolean;
  isProduction: boolean;
};

try {
  const env = envSchema.parse(process.env);
  config = {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    corsOrigin: env.CORS_ORIGIN,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
  };
} catch (error) {
  config = {
    nodeEnv: 'development',
    port: 3001,
    databaseUrl: process.env.DATABASE_URL || '',
    jwtSecret: process.env.JWT_SECRET || 'desenvolvimento-jwt-secret-super-longo-e-seguro-32-chars',
    jwtExpiresIn: '7d',
    corsOrigin: 'http://localhost:3000',
    isDevelopment: true,
    isProduction: false,
  };
}

export { config };
