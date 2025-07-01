import { Router, Request, Response } from 'express';
import { authenticate, authRateLimit, validateOwnership, requireOnboarding } from '../middleware/auth';

// Import controllers
import AuthController from '../controllers/auth.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { ExpenseController } from '../controllers/expense.controller';
import { PaymentController } from '../controllers/payment.controller';
import { CategoryController } from '../controllers/category.controller';
import { CreditCardController } from '../controllers/creditCard.controller';
import { PayerController } from '../controllers/payer.controller';
import { CSVController } from '../controllers/csv.controller';
import ReportController from '../controllers/report.controller';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
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

// Public auth routes (with rate limiting)
authRouter.post('/register', authRateLimit(3, 15 * 60 * 1000), AuthController.register);
authRouter.post('/login', authRateLimit(5, 15 * 60 * 1000), AuthController.login);
authRouter.post('/refresh-token', authRateLimit(10, 15 * 60 * 1000), AuthController.refreshToken);

// Protected auth routes
authRouter.get('/profile', authenticate, AuthController.getProfile);
authRouter.put('/profile', authenticate, AuthController.updateProfile);
authRouter.post('/change-password', authenticate, AuthController.changePassword);
authRouter.post('/logout', authenticate, AuthController.logout);
authRouter.get('/verify-token', authenticate, AuthController.verifyToken);
authRouter.get('/onboarding-status', authenticate, AuthController.getOnboardingStatus);

router.use('/auth', authRouter);

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================
const dashboardRouter = Router();

dashboardRouter.get('/', authenticate, requireOnboarding, DashboardController.getDashboard);
dashboardRouter.get('/quick-stats', authenticate, requireOnboarding, DashboardController.getQuickStats);

router.use('/dashboard', dashboardRouter);

// ============================================================================
// EXPENSE ROUTES
// ============================================================================
const expenseRouter = Router();

expenseRouter.get('/', authenticate, requireOnboarding, ExpenseController.getAll);
expenseRouter.post('/', authenticate, requireOnboarding, ExpenseController.create);
expenseRouter.get('/:id', authenticate, validateOwnership('expense'), ExpenseController.getById);
expenseRouter.put('/:id', authenticate, validateOwnership('expense'), ExpenseController.update);
expenseRouter.delete('/:id', authenticate, validateOwnership('expense'), ExpenseController.delete);
expenseRouter.post('/:id/duplicate', authenticate, validateOwnership('expense'), ExpenseController.duplicate);
expenseRouter.patch('/:id/toggle-pause', authenticate, validateOwnership('expense'), ExpenseController.togglePause);

router.use('/expenses', expenseRouter);

// ============================================================================
// PAYMENT ROUTES
// ============================================================================
const paymentRouter = Router();

paymentRouter.get('/', authenticate, requireOnboarding, PaymentController.getPayments);
paymentRouter.post('/mark-as-paid', authenticate, requireOnboarding, PaymentController.markAsPaid);
paymentRouter.post('/bulk-mark-as-paid', authenticate, requireOnboarding, PaymentController.bulkMarkAsPaid);
paymentRouter.patch('/:id/revert', authenticate, PaymentController.revertPayment);
paymentRouter.patch('/:id/due-date', authenticate, PaymentController.updateDueDate);
paymentRouter.get('/stats', authenticate, requireOnboarding, PaymentController.getPaymentStats);

router.use('/payments', paymentRouter);

// ============================================================================
// CATEGORY ROUTES
// ============================================================================
const categoryRouter = Router();

categoryRouter.get('/', authenticate, CategoryController.getAll);
categoryRouter.post('/', authenticate, CategoryController.create);
categoryRouter.put('/:id', authenticate, validateOwnership('category'), CategoryController.update);
categoryRouter.delete('/:id', authenticate, validateOwnership('category'), CategoryController.delete);

router.use('/categories', categoryRouter);

// ============================================================================
// CREDIT CARD ROUTES
// ============================================================================
const creditCardRouter = Router();

creditCardRouter.get('/', authenticate, CreditCardController.getAll);
creditCardRouter.post('/', authenticate, CreditCardController.create);
creditCardRouter.get('/upcoming-due-dates', authenticate, CreditCardController.getUpcomingDueDates);
creditCardRouter.get('/:id', authenticate, validateOwnership('creditCard'), CreditCardController.getById);
creditCardRouter.put('/:id', authenticate, validateOwnership('creditCard'), CreditCardController.update);
creditCardRouter.delete('/:id', authenticate, validateOwnership('creditCard'), CreditCardController.delete);
creditCardRouter.patch('/:id/toggle-active', authenticate, validateOwnership('creditCard'), CreditCardController.toggleActive);
creditCardRouter.get('/:id/usage-summary', authenticate, validateOwnership('creditCard'), CreditCardController.getUsageSummary);

router.use('/credit-cards', creditCardRouter);

// ============================================================================
// PAYER ROUTES
// ============================================================================
const payerRouter = Router();

payerRouter.get('/', authenticate, PayerController.getAll);
payerRouter.post('/', authenticate, PayerController.create);
payerRouter.get('/:id', authenticate, validateOwnership('payer'), PayerController.getById);
payerRouter.put('/:id', authenticate, validateOwnership('payer'), PayerController.update);
payerRouter.delete('/:id', authenticate, validateOwnership('payer'), PayerController.delete);
payerRouter.patch('/:id/toggle-active', authenticate, validateOwnership('payer'), PayerController.toggleActive);
payerRouter.get('/:id/stats', authenticate, validateOwnership('payer'), PayerController.getStats);

router.use('/payers', payerRouter);

// ============================================================================
// REPORT ROUTES
// ============================================================================
const reportRouter = Router();

reportRouter.get('/expenses', authenticate, requireOnboarding, ReportController.expenseReport);
reportRouter.get('/categories', authenticate, requireOnboarding, ReportController.categoryReport);
reportRouter.get('/payers', authenticate, requireOnboarding, ReportController.payerReport);
reportRouter.get('/dashboard', authenticate, requireOnboarding, ReportController.dashboardReport);
reportRouter.get('/financial-summary', authenticate, requireOnboarding, ReportController.financialSummary);

router.use('/reports', reportRouter);

// ============================================================================
// CSV IMPORT/EXPORT ROUTES
// ============================================================================
const csvRouter = Router();

csvRouter.post('/import', authenticate, requireOnboarding, CSVController.importCSV);
csvRouter.get('/export', authenticate, requireOnboarding, CSVController.exportCSV);

router.use('/csv', csvRouter);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for API routes
router.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'POST /api/auth/login',
      'GET /api/dashboard',
      'GET /api/expenses',
      'GET /api/reports/*',
      'POST /api/csv/import',
      'GET /api/csv/export'
    ]
  });
});

// Global error handler for API routes
router.use((error: any, req: Request, res: Response, next: any) => {
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(error.status || 500).json({
    success: false,
    message: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { 
      error: error.message, 
      stack: error.stack
    }),
  });
});

export default router;