#!/bin/bash

# 🧪 Testes da API Partilio com cURL
# ==================================

API_URL="https://partilio-backend.onrender.com"
TOKEN=""

echo "🚀 Iniciando testes da API Partilio..."
echo "====================================="

# 1. Health Check
echo "🔍 1. Testando Health Check..."
curl -s "$API_URL/health" | jq '.'

echo ""
echo "🔍 2. Testando API Health..."
curl -s "$API_URL/api/health" | jq '.'

# 3. Login
echo ""
echo "🔐 3. Testando Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}')

echo "$LOGIN_RESPONSE" | jq '.'

# Extrair token (se jq estiver disponível)
if command -v jq &> /dev/null; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token // empty')
    echo "Token extraído: ${TOKEN:0:20}..."
fi

# 4. Dashboard
echo ""
echo "📊 4. Testando Dashboard..."
curl -s "$API_URL/api/dashboard" | jq '.'

# 5. Categorias
echo ""
echo "🏷️ 5. Testando Categorias..."
curl -s "$API_URL/api/categories" | jq '.'

# 6. Listar Despesas
echo ""
echo "💰 6. Testando Lista de Despesas..."
curl -s "$API_URL/api/expenses" | jq '.'

# 7. Criar Despesa
echo ""
echo "➕ 7. Testando Criação de Despesa..."
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/api/expenses" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Teste API",
    "supplier": "Fornecedor Teste",
    "amount": 99.99,
    "categoryId": "1"
  }')

echo "$CREATE_RESPONSE" | jq '.'

# Extrair ID da despesa criada
if command -v jq &> /dev/null; then
    EXPENSE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id // empty')
    if [ -n "$EXPENSE_ID" ]; then
        echo "ID da despesa criada: $EXPENSE_ID"
        
        # 8. Atualizar Despesa
        echo ""
        echo "✏️ 8. Testando Atualização de Despesa..."
        curl -s -X PUT "$API_URL/api/expenses/$EXPENSE_ID" \
          -H "Content-Type: application/json" \
          -d '{
            "description": "Teste API Atualizado",
            "amount": 199.99
          }' | jq '.'
        
        # 9. Excluir Despesa
        echo ""
        echo "🗑️ 9. Testando Exclusão de Despesa..."
        curl -s -X DELETE "$API_URL/api/expenses/$EXPENSE_ID" | jq '.'
    fi
fi

# 10. Teste de endpoint não existente
echo ""
echo "❌ 10. Testando Endpoint Inexistente..."
curl -s "$API_URL/api/inexistente" | jq '.'

echo ""
echo "✅ Testes concluídos!"
echo "===================="
echo ""
echo "💡 Para usar com autenticação:"
echo "curl -H \"Authorization: Bearer \$TOKEN\" $API_URL/api/auth/profile"
