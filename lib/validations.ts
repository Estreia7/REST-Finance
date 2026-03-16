import { z } from 'zod';

// === Daily Summary (Revenue Entry) ===
export const dailySummarySchema = z.object({
  date: z.coerce.date(),
  dineInRevenue: z.number().min(0, 'Receita não pode ser negativa').max(999999, 'Valor demasiado alto'),
  takeawayRevenue: z.number().min(0, 'Receita não pode ser negativa').max(999999, 'Valor demasiado alto'),
  dineInTickets: z.number().int('Tickets devem ser números inteiros').min(0, 'Tickets não podem ser negativos').max(9999),
  takeawayTickets: z.number().int('Tickets devem ser números inteiros').min(0, 'Tickets não podem ser negativos').max(9999),
  notes: z.string().max(500).optional(),
});

export type DailySummaryInput = z.infer<typeof dailySummarySchema>;

// === Cost Entry ===
export const costEntrySchema = z.object({
  date: z.coerce.date(),
  type: z.enum(['COGS', 'OPEX'], { message: 'Tipo deve ser COGS ou OPEX' }),
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.number().min(0.01, 'Valor deve ser positivo').max(999999, 'Valor demasiado alto'),
  description: z.string().max(500).optional(),
});

export type CostEntryInput = z.infer<typeof costEntrySchema>;

// === Registration ===
export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Palavra-passe deve ter pelo menos 8 caracteres').max(128),
  restaurantName: z.string().min(2, 'Nome do restaurante deve ter pelo menos 2 caracteres').max(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// === Change Password ===
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Palavra-passe atual é obrigatória'),
  newPassword: z.string().min(8, 'Nova palavra-passe deve ter pelo menos 8 caracteres').max(128),
});

// === Scan Request ===
export const scanRequestSchema = z.object({
  imageBase64: z.string().min(100, 'Imagem inválida').max(10_000_000, 'Imagem demasiado grande (max 7.5MB)'),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp'], { message: 'Formato de imagem inválido' }),
  scanType: z.enum(['COST_RECEIPT', 'DAILY_REPORT'], { message: 'Tipo de scan inválido' }),
});

// === Helper to format Zod errors ===
export function formatZodError(error: z.ZodError): string {
  return error.errors.map(e => e.message).join(', ');
}
