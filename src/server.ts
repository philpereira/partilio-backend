import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/env';
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
      limit: '10mb'
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

    console.log('✅ Middlewares initialized successfully');
  }

  /**
   * Initialize API routes
   */
  private initializeRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Catch all for undefined routes
    this.app.all('*', (req: Request, res: Response) => {
      console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);

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
          'GET /api/expenses'
        ]
      });
    });

    console.log('✅ Routes initialized successfully');
  }

  /**
   * Initialize error handling
   */
  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      console.error('❌ Unhandled application error:', {
        message: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
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
      };

      // Add debug info in development
      if (config.isDevelopment) {
        errorResponse.error = error.message;
        errorResponse.stack = error.stack;
        errorResponse.details = {
          url: req.originalUrl,
          method: req.method,
        };
      }

      res.status(statusCode).json(errorResponse);
    });

    console.log('✅ Error handling initialized successfully');
  }

  /**
   * Start the server
   */
  public start(): void {
    const server = this.app.listen(this.port, () => {
      console.log(`
🚀 Partilio API Server Started Successfully!
   
📍 Environment: ${config.nodeEnv}
🌐 Server: http://localhost:${this.port}
🔗 Health Check: http://localhost:${this.port}/health
📚 API Base: http://localhost:${this.port}/api

🔐 CORS Origin: ${config.corsOrigin}
⏰ Started at: ${new Date().toISOString()}

🎯 Deploy Status: READY FOR DEPLOYMENT! 🚀
      `);
    });

    // Graceful shutdown handler
    const gracefulShutdown = (signal: string) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(() => {
        console.log('✅ HTTP server closed.');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.error('❌ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      if (config.isDevelopment) {
        process.exit(1);
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
  }
}

// Create and start server
const server = new Server();
server.start();

export default server.app;