import { Router, Request, Response } from 'express';
import { authenticate, authRateLimit } from '../middleware/auth';

// Import controllers - FIX: Imports corretos
import { AuthController } from '../controllers/auth.controller';
import { ExpenseController } from '../controllers/expense.controller';
import { CategoryController } from '../controllers/category.controller';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'API funcionando',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: 'connected',
      api: 'running'
    }
  });
});

// ============================================================================
// AUTH ROUTES
// ============================================================================
const authRouter = Router();

// Rotas públicas de auth (com rate limiting)
authRouter.post('/login', authRateLimit(5, 15 * 60 * 1000), AuthController.login);
authRouter.post('/register', authRateLimit(3, 15 * 60 * 1000), AuthController.register);

// Rotas protegidas de auth
authRouter.get('/verify-token', authenticate, AuthController.verifyToken);
authRouter.get('/profile', authenticate, AuthController.getProfile);

router.use('/auth', authRouter);

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================
const dashboardRouter = Router();

// FIX: Usar método estático corretamente
dashboardRouter.get('/', DashboardController.getDashboard);

router.use('/dashboard', dashboardRouter);

// ============================================================================
// EXPENSE ROUTES
// ============================================================================
const expenseRouter = Router();

// FIX: Usar métodos estáticos corretamente
expenseRouter.get('/', ExpenseController.getAll);
expenseRouter.post('/', ExpenseController.create);
expenseRouter.put('/:id', ExpenseController.update);
expenseRouter.delete('/:id', ExpenseController.delete);

router.use('/expenses', expenseRouter);

// ============================================================================
// CATEGORY ROUTES
// ============================================================================
const categoryRouter = Router();

// FIX: Usar método estático corretamente
categoryRouter.get('/', CategoryController.getAll);

router.use('/categories', categoryRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler para rotas da API
router.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/dashboard',
      'GET /api/expenses',
      'POST /api/expenses',
      'PUT /api/expenses/:id',
      'DELETE /api/expenses/:id',
      'GET /api/categories'
    ]
  });
});

export default router;