import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

// Adicione outros schemas conforme necessário

export const schemas = {
  auth: {
    login: loginSchema,
  },
};

export default schemas;