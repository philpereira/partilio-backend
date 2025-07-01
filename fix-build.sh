#!/bin/bash

echo "🔧 PARTILIO BACKEND - CORREÇÃO AUTOMÁTICA DE BUILD"
echo "=================================================="

# 1. Backup dos arquivos atuais
echo "📁 Fazendo backup dos arquivos atuais..."
cp tsconfig.json tsconfig.json.backup 2>/dev/null || echo "   tsconfig.json não encontrado"
cp package.json package.json.backup 2>/dev/null || echo "   package.json não encontrado"

# 2. Remover dependências problemáticas
echo "🧹 Limpando dependências problemáticas..."
rm -rf node_modules package-lock.json

# 3. Aplicar tsconfig.json simplificado
echo "⚙️ Aplicando tsconfig.json simplificado..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false,
    "removeComments": true,
    "types": ["node"]
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ]
}
EOF

# 4. Verificar se package.json existe e corrigir dependências problemáticas
echo "📦 Corrigindo package.json..."
if [ -f "package.json" ]; then
    # Remover json2csv que estava causando problemas
    sed -i.bak 's/.*"json2csv".*,//g' package.json 2>/dev/null || true
    # Garantir que @types/node está presente
    if ! grep -q '"@types/node"' package.json; then
        sed -i.bak 's/"devDependencies": {/"devDependencies": {\n    "@types\/node": "^20.10.5",/' package.json
    fi
else
    echo "❌ package.json não encontrado! Criando arquivo básico..."
    cat > package.json << 'EOF'
{
  "name": "partilio-backend",
  "version": "1.0.0",
  "main": "dist/server.js",
  "scripts": {
    "build": "npx prisma generate && tsc",
    "start": "node dist/server.js",
    "postinstall": "npx prisma generate"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.5",
    "typescript": "^5.3.3",
    "prisma": "^5.22.0"
  }
}
EOF
fi

# 5. Reinstalar dependências
echo "📥 Reinstalando dependências..."
npm install

# 6. Gerar Prisma Client
echo "🗄️ Gerando Prisma Client..."
npx prisma generate

# 7. Tentar fazer o build
echo "🔨 Testando build..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ BUILD CORRIGIDO COM SUCESSO!"
    echo "================================="
    echo "🎉 O projeto agora deve fazer build sem erros."
    echo ""
    echo "📤 Próximos passos para deploy:"
    echo "   1. git add ."
    echo "   2. git commit -m \"fix: corrigir configuração TypeScript para build\""
    echo "   3. git push origin main"
    echo ""
    echo "🚀 O deploy no Render deve funcionar agora!"
else
    echo ""
    echo "❌ AINDA HÁ PROBLEMAS NO BUILD"
    echo "==============================="
    echo "📋 Verifique os erros acima e execute:"
    echo "   npm run build --verbose"
fi

echo ""
echo "📂 Arquivos de backup criados:"
echo "   - tsconfig.json.backup"
echo "   - package.json.backup"