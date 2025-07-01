
#!/bin/bash

echo "🔧 CORREÇÃO DEFINITIVA DOS ERROS DE DEPLOY"
echo "=========================================="

# 1. Corrigir tsconfig.json
echo "📝 Corrigindo tsconfig.json..."
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
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
    "dist",
    "src/server-mvp-backup.ts"
  ]
}
