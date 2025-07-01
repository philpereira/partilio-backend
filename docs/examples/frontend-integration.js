// 🚀 Exemplo de Integração Frontend - Partilio API
// ===============================================

const API_URL = 'https://partilio-backend.onrender.com';

class PartilioAPI {
  constructor() {
    this.token = localStorage.getItem('partilio_token');
  }

  // 🔐 Autenticação
  async login(email, password) {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      
      if (data.success) {
        this.token = data.data.token;
        localStorage.setItem('partilio_token', this.token);
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Erro no login:', error);
      throw error;
    }
  }

  // 📊 Dashboard
  async getDashboard() {
    try {
      const response = await fetch(`${API_URL}/api/dashboard`);
      const data = await response.json();
      return data.success ? data.data : null;
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      return null;
    }
  }

  // 💰 Despesas
  async getExpenses() {
    try {
      const response = await fetch(`${API_URL}/api/expenses`, {
        headers: this.getAuthHeaders()
      });
      const data = await response.json();
      return data.success ? data.data : [];
    } catch (error) {
      console.error('Erro ao buscar despesas:', error);
      return [];
    }
  }

  async createExpense(expense) {
    try {
      const response = await fetch(`${API_URL}/api/expenses`, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(expense)
      });

      const data = await response.json();
      
      if (data.success) {
        return data.data;
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error('Erro ao criar despesa:', error);
      throw error;
    }
  }

  async updateExpense(id, updates) {
    try {
      const response = await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();
      return data.success ? data.data : null;
    } catch (error) {
      console.error('Erro ao atualizar despesa:', error);
      throw error;
    }
  }

  async deleteExpense(id) {
    try {
      const response = await fetch(`${API_URL}/api/expenses/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Erro ao excluir despesa:', error);
      return false;
    }
  }

  // 🏷️ Categorias
  async getCategories() {
    try {
      const response = await fetch(`${API_URL}/api/categories`);
      const data = await response.json();
      return data.success ? data.data : [];
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      return [];
    }
  }

  // 🛠️ Utilitários
  getAuthHeaders() {
    return this.token ? {
      'Authorization': `Bearer ${this.token}`
    } : {};
  }

  isAuthenticated() {
    return !!this.token;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('partilio_token');
  }
}

// 📋 Exemplo de uso
async function exemploDeUso() {
  const api = new PartilioAPI();

  try {
    // 1. Login
    const user = await api.login('test@test.com', '123456');
    console.log('✅ Login realizado:', user);

    // 2. Buscar dashboard
    const dashboard = await api.getDashboard();
    console.log('📊 Dashboard:', dashboard);

    // 3. Listar despesas
    const expenses = await api.getExpenses();
    console.log('💰 Despesas:', expenses);

    // 4. Criar nova despesa
    const newExpense = await api.createExpense({
      description: 'Supermercado',
      supplier: 'Carrefour',
      amount: 150.50,
      categoryId: '1'
    });
    console.log('✅ Despesa criada:', newExpense);

    // 5. Buscar categorias
    const categories = await api.getCategories();
    console.log('🏷️ Categorias:', categories);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Export para uso em módulos
export default PartilioAPI;
