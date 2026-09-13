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

/**
 * Partial update of a revenue entry. Every field is optional, but any field
 * that IS supplied must satisfy the same bounds as on creation — otherwise a
 * negative or absurd revenue could be written through the update path that
 * creation correctly rejects.
 */
export const dailySummaryUpdateSchema = dailySummarySchema.partial().strict();

export type DailySummaryUpdateInput = z.infer<typeof dailySummaryUpdateSchema>;

// === Cost Entry ===
export const costEntrySchema = z.object({
  date: z.coerce.date(),
  type: z.enum(['COGS', 'OPEX'], { message: 'Tipo deve ser COGS ou OPEX' }),
  categoryId: z.string().uuid().optional().nullable(),
  amount: z.number().min(0.01, 'Valor deve ser positivo').max(999999, 'Valor demasiado alto'),
  description: z.string().max(500).optional(),
});

export type CostEntryInput = z.infer<typeof costEntrySchema>;

/** Partial update of a cost entry. See dailySummaryUpdateSchema. */
export const costEntryUpdateSchema = costEntrySchema.partial().strict();

export type CostEntryUpdateInput = z.infer<typeof costEntryUpdateSchema>;

// === Vendor ===
export const vendorSchema = z.object({
  name: z.string().trim().min(2, 'Nome demasiado curto').max(200, 'Nome demasiado longo'),
  taxId: z.string().trim().max(20, 'NIF inválido').optional().nullable(),
});

export type VendorInput = z.infer<typeof vendorSchema>;

// === Invoice line item ===
export const invoiceItemSchema = z.object({
  productName: z.string().trim().min(1, 'Produto obrigatório').max(200),
  quantity: z.number().positive('Quantidade deve ser positiva').max(999999),
  unit: z.string().trim().max(20).optional().nullable(),
  unitPrice: z.number().min(0, 'Preço não pode ser negativo').max(999999),
  totalPrice: z.number().min(0, 'Total não pode ser negativo').max(9999999),
  invoiceNumber: z.string().trim().max(100).optional().nullable(),
  invoiceDate: z.coerce.date().optional().nullable(),
});

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

/**
 * Shortest password we accept, everywhere.
 *
 * One constant because the forms and the server had drifted apart: the
 * client let a six-character password through and the server rejected it at
 * eight, so the person got an error for something the form had just told
 * them was fine.
 */
export const MIN_PASSWORD_LENGTH = 8;

// === Registration ===
export const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().email('Email inválido'),
  password: z.string().min(MIN_PASSWORD_LENGTH, 'Palavra-passe deve ter pelo menos 8 caracteres').max(128),
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
