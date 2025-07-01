import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

// Health Checks
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    database: 'connected',
    version: '1.0.0'
  });
});

// Auth básico
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email e senha são obrigatórios'
    });
  }

  res.json({
    success: true,
    data: {
      user: { id: '1', email, name: 'Usuário Demo' },
      token: 'demo-token-' + Date.now()
    }
  });
});

// Expenses básico
app.get('/api/expenses', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', description: 'Supermercado', amount: 150.50, category: 'Alimentação' },
      { id: '2', description: 'Combustível', amount: 80.00, category: 'Transporte' }
    ]
  });
});

app.post('/api/expenses', (req, res) => {
  const { description, amount, category } = req.body;
  
  if (!description || !amount) {
    return res.status(400).json({
      success: false,
      error: 'Descrição e valor são obrigatórios'
    });
  }

  res.status(201).json({
    success: true,
    data: {
      id: Date.now().toString(),
      description,
      amount: parseFloat(amount),
      category: category || 'Geral',
      date: new Date().toISOString().split('T')[0]
    }
  });
});

// Categories
app.get('/api/categories', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: '1', name: 'Alimentação' },
      { id: '2', name: 'Transporte' },
      { id: '3', name: 'Moradia' },
      { id: '4', name: 'Saúde' }
    ]
  });
});

// Dashboard
app.get('/api/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      totalExpenses: 1250.75,
      monthlyAverage: 625.38,
      topCategory: 'Alimentação',
      expenseCount: 15
    }
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado'
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('🚀 Partilio API Server Started Successfully!');
  console.log('📍 Server running on port ' + PORT);
});
