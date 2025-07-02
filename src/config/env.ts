// Configuração simplificada que funciona sempre
export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001'),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'desenvolvimento-jwt-secret-super-longo-e-seguro-32-chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Permitir múltiplas origens separadas por vírgula
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim()),
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};
