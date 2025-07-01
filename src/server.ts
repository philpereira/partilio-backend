import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Internal imports
import { connectDatabase, disconnectDatabase } from './config/database';
import { config } from './config/env';
import { logger, requestLogger, errorLogger } from './utils/logger';
import { handleUploadError } from './middleware/upload';
import routes from './routes';

/**
 * Main Express application
 */
class Server {
  public app: Application;
  private readonly port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize all middlewares
   */
  private initializeMiddlewares(): void {
    // Trust proxy (for load balancers, reverse proxies)
    if (config.isProduction) {
      this.app.set('trust proxy', 1);
    }

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for API
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Correlation-ID'
      ],
      exposedHeaders: ['X-Correlation-ID']
    }));

    // Request compression
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: Request, res: Response, buf: Buffer) => {
        // Store raw body for webhook verification if needed
        (req as any).rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request logging
    if (config.isDevelopment) {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Custom request logger
    this.app.use(requestLogger);

    // Global rate limiting
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: config.isDevelopment ? 1000 : 100, // More requests in dev
      message: {
        success: false,
        message: 'Muitas requisições. Tente novamente em 15 minutos.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        logger.security('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          url: req.originalUrl
        });

        res.status(429).json({
          success: false,
          message: 'Muitas requisições. Tente novamente em 15 minutos.',
          code: 'RATE_LIMIT_EXCEEDED'
        });
      }
    });

    this.app.use(globalLimiter);

    // File upload error handling
    this.app.use(handleUploadError);

    // Health check endpoint (before other routes)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.nodeEnv,
        uptime: process.uptime()
      });
    });

    logger.info('Middlewares initialized successfully');
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Catch all for undefined routes
    this.app.all('*', (req: Request, res: Response) => {
      logger.warn('Route not found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      res.status(404).json({
        success: false,
        message: 'Rota não encontrada',
        path: req.originalUrl,
        method: req.method,
        availableRoutes: [
          'GET /health',
          'GET /api/health',
          'POST /api/auth/login',
          'POST /api/auth/register',
          'GET /api/dashboard',
          'GET /api/expenses',
          'GET /api/reports/*',
          'POST /api/csv/import',
          'GET /api/csv/export'
        ]
      });
    });

    logger.info('Routes initialized successfully');
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Error logging middleware
    this.app.use(errorLogger);

    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      const correlationId = (req as any).correlationId;
      
      // Log error with correlation ID
      logger.withCorrelation(correlationId).error('Unhandled application error', error, {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        userId: (req as any).user?.id,
        body: req.body,
        query: req.query,
        params: req.params
      });

      // Determine status code
      let statusCode = error.status || error.statusCode || 500;
      
      // Handle specific error types
      if (error.name === 'ValidationError') {
        statusCode = 400;
      } else if (error.name === 'UnauthorizedError') {
        statusCode = 401;
      } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
      }

      // Prepare error response
      const errorResponse: any = {
        success: false,
        message: config.isDevelopment ? error.message : 'Erro interno do servidor',
        timestamp: new Date().toISOString(),
        correlationId
      };

      // Add development-specific error details
      if (config.isDevelopment) {
        errorResponse.error = {
          name: error.name,
          message: error.message,
          stack: error.stack
        };
        errorResponse.request = {
          method: req.method,
          url: req.originalUrl,
          headers: req.headers,
          body: req.body,
          query: req.query,
          params: req.params
        };
      }

      res.status(statusCode).json(errorResponse);
    });

    logger.info('Error handling initialized successfully');
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Connect to database
      logger.info('Connecting to database...');
      await connectDatabase();
      logger.info('Database connected successfully');

      // Start HTTP server
      const server = this.app.listen(this.port, () => {
        logger.info(`🚀 Server started successfully`, {
          port: this.port,
          environment: config.nodeEnv,
          version: process.env.npm_package_version || '1.0.0',
          corsOrigin: config.corsOrigin,
          logLevel: process.env.LOG_LEVEL || 'info'
        });

        if (config.isDevelopment) {
          console.log(`
🏦 Partilio Backend API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 API Server:     http://localhost:${this.port}
📊 Health Check:   http://localhost:${this.port}/health
📖 API Docs:       http://localhost:${this.port}/api/health
🗄️  Database:       ${config.databaseUrl.split('@')[1] || 'Connected'}
🛡️  CORS Origin:    ${config.corsOrigin}
📝 Log Level:      ${process.env.LOG_LEVEL || 'info'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Available Endpoints:
   🔐 Authentication:     POST /api/auth/login
   👥 User Management:    GET  /api/auth/profile
   📊 Dashboard:          GET  /api/dashboard
   💰 Expenses:           GET  /api/expenses
   🏷️  Categories:        GET  /api/categories
   💳 Credit Cards:       GET  /api/credit-cards
   👤 Payers:             GET  /api/payers
   📈 Reports:            GET  /api/reports/*
   📄 CSV Import/Export:  POST /api/csv/import
                         GET  /api/csv/export

🚀 Ready to handle requests!
          `);
        }
      });

      // Graceful shutdown handlers
      this.setupGracefulShutdown(server);

    } catch (error) {
      logger.error('Failed to start server', error as Error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown handling
   */
  private setupGracefulShutdown(server: any): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new requests
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connections
          await disconnectDatabase();
          logger.info('Database disconnected');

          // Exit process
          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error as Error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000); // 30 seconds timeout
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', new Error(String(reason)), {
        reason,
        promise: promise.toString()
      });
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  }
}

// Create and export server instance
const server = new Server();

// Start server if this file is run directly
if (require.main === module) {
  server.start().catch((error) => {
    logger.error('Failed to start application', error as Error);
    process.exit(1);
  });
}

export default server.app;