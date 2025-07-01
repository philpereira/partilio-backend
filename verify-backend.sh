#!/bin/bash

# 🔍 Script de Verificação Final - Backend Partilio
# Execute na pasta backend/ antes do deploy

echo "🔍 Verificando preparação final para deploy..."
echo "=============================================="

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Função para verificar sucesso/erro
check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        return 0
    else
        echo -e "${RED}❌ $3${NC}"
        return 1
    fi
}

# Verificar se está na pasta backend
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Execute este script na pasta backend/${NC}"
    exit 1
fi

echo "📂 Verificando estrutura de arquivos..."

# Verificar arquivos essenciais
essential_files=(
    "package.json"
    "tsconfig.json" 
    ".env.example"
    ".gitignore"
    "prisma/schema.prisma"
    "src/server.ts"
    "src/config/env.ts"
    "src/types/index.ts"
    "src/middleware/auth.ts"
    "src/routes/index.ts"
    "src/controllers/auth.controller.ts"
    "render.yaml"
)

for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file não encontrado${NC}"
        exit 1
    fi
done

echo ""
echo "📦 Verificando dependências e build..."

# Instalar dependências
echo "📥 Instalando dependências..."
npm install > /dev/null 2>&1
check_status $? "Dependências instaladas" "Falha na instalação de dependências"

# Verificar scripts do package.json
echo "📋 Verificando scripts..."
if grep -q '"build".*"npx prisma generate && tsc"' package.json; then
    echo -e "${GREEN}✅ Script build configurado corretamente${NC}"
else
    echo -e "${RED}❌ Script build incorreto${NC}"
    exit 1
fi

if grep -q '"start".*"node dist/server.js"' package.json; then
    echo -e "${GREEN}✅ Script start configurado corretamente${NC}"
else
    echo -e "${RED}❌ Script start incorreto${NC}"
    exit 1
fi

if grep -q '"postinstall".*"npx prisma generate"' package.json; then
    echo -e "${GREEN}✅ Script postinstall configurado corretamente${NC}"
else
    echo -e "${RED}❌ Script postinstall incorreto${NC}"
    exit 1
fi

echo ""
echo "🗄️ Verificando Prisma..."

# Gerar client Prisma
echo "🔄 Gerando cliente Prisma..."
npx prisma generate > /dev/null 2>&1
check_status $? "Cliente Prisma gerado" "Falha ao gerar cliente Prisma"

echo ""
echo "🔧 Testando build..."

# Limpar build anterior
if [ -d "dist" ]; then
    rm -rf dist
fi

# Testar build
echo "🏗️ Executando build..."
npm run build > build.log 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build executado com sucesso${NC}"
else
    echo -e "${RED}❌ Falha no build${NC}"
    echo "📄 Log do build:"
    cat build.log
    exit 1
fi

# Verificar se dist foi criado
if [ -d "dist" ] && [ -f "dist/server.js" ]; then
    echo -e "${GREEN}✅ Arquivo dist/server.js criado${NC}"
else
    echo -e "${RED}❌ Arquivo dist/server.js não foi criado${NC}"
    exit 1
fi

echo ""
echo "🌐 Verificando configurações..."

# Verificar se tem .env local (não deve ser commitado)
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  ATENÇÃO: Arquivo .env encontrado${NC}"
    echo -e "${YELLOW}   Certifique-se de que está no .gitignore${NC}"
fi

# Verificar .gitignore
if grep -q "\.env" .gitignore && grep -q "node_modules" .gitignore && grep -q "dist" .gitignore; then
    echo -e "${GREEN}✅ .gitignore configurado corretamente${NC}"
else
    echo -e "${YELLOW}⚠️  Verificar configuração do .gitignore${NC}"
fi

# Verificar render.yaml
if grep -q "partilio-backend" render.yaml && grep -q "npm run build" render.yaml; then
    echo -e "${GREEN}✅ render.yaml configurado${NC}"
else
    echo -e "${RED}❌ render.yaml mal configurado${NC}"
    exit 1
fi

echo ""
echo "🧪 Testando servidor local..."

# Testar start do servidor (por 5 segundos)
echo "🚀 Testando start do servidor..."
timeout 5s npm start > server.log 2>&1 &
SERVER_PID=$!
sleep 3

# Verificar se está rodando
if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Servidor iniciou corretamente${NC}"
    kill $SERVER_PID 2>/dev/null
else
    echo -e "${RED}❌ Servidor falhou ao iniciar${NC}"
    echo "📄 Log do servidor:"
    cat server.log
    exit 1
fi

echo ""
echo "================================================"
echo -e "${GREEN}🎉 VERIFICAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
echo ""
echo -e "${BLUE}📋 Status do Backend:${NC}"
echo "   ✅ Estrutura de arquivos completa"
echo "   ✅ Dependências instaladas"
echo "   ✅ Build funcionando"
echo "   ✅ Servidor iniciando"
echo "   ✅ Configuração Render pronta"
echo ""
echo -e "${GREEN}🚀 PRONTO PARA DEPLOY NO RENDER!${NC}"
echo ""
echo -e "${BLUE}Próximos passos:${NC}"
echo "1. 📤 Commit e push para seu repositório Git"
echo "2. 🌐 Acessar https://render.com"
echo "3. 🔗 Conectar repositório"
echo "4. ➕ Criar 'New Web Service'"
echo "5. ⚙️  Usar configurações do render.yaml"
echo "6. 🗄️ Criar PostgreSQL database"
echo "7. 🔐 Configurar environment variables"
echo ""
echo -e "${YELLOW}Build command:${NC} npm install && npx prisma generate && npm run build"
echo -e "${YELLOW}Start command:${NC} npm start"
echo ""

# Limpeza
rm -f build.log server.log

echo "✨ Verificação completa! Backend pronto para deploy! 🚀"