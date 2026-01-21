'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { MembershipRole, Plan } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
}) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:13',message:'registerUser called',data:{email:data.email,hasDatabaseUrl:!!process.env.DATABASE_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  try {
    // 1. Create Supabase auth user
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return { error: 'Configuração do servidor incompleta. Contacte o suporte.' };
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
        },
      },
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Falha ao criar conta de utilizador' };
    }

    // 2. Create User record in database (using auth user ID)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:43',message:'Before prisma.user.create',data:{userId:authData.user.id,prismaExists:!!prisma},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    const user = await prisma.user.create({
      data: {
        id: authData.user.id,
        email: data.email,
        name: data.name,
      },
    });

    // 3. Create Restaurant with trial plan
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days trial

    const restaurant = await prisma.restaurant.create({
      data: {
        name: data.restaurantName,
        plan: Plan.TRIAL,
        trialEndsAt,
      },
    });

    // 4. Create Membership with OWNER role
    await prisma.membership.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        role: MembershipRole.OWNER,
        active: true,
      },
    });

    return { success: true, userId: user.id };
  } catch (error: any) {
    console.error('Registration error:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/07bd29ab-3687-4c3d-8b94-97adc84478a7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:75',message:'Registration error caught',data:{errorMessage:error.message,errorCode:error.code,errorName:error.name,hasDatabaseUrl:!!process.env.DATABASE_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('email')) {
        return { error: 'Este email já está registado. Tente fazer login.' };
      }
    }

    return { error: error.message || 'Erro ao criar conta. Tente novamente.' };
  }
}
