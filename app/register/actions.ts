'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
// Keep these in sync with the Prisma enums in schema.prisma
type MembershipRole = 'OWNER' | 'STAFF' | 'PLATFORM_ADMIN';
type Plan = 'TRIAL' | 'MONTHLY' | 'YEARLY';
import { prisma } from '@/lib/prisma';

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  restaurantName: string;
}) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:13',message:'registerUser called',data:{email:data.email,hasDatabaseUrl:!!process.env.DATABASE_URL,typeofWindow:typeof window,isServer:typeof window==='undefined',prismaType:typeof prisma},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
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

    // 2. Check if user already has a restaurant (one restaurant per owner)
    const existingUser = await prisma.user.findUnique({
      where: { id: authData.user.id },
      include: {
        memberships: {
          where: {
            role: 'OWNER',
            active: true,
          },
        },
      },
    });

    if (existingUser && existingUser.memberships.length > 0) {
      return { error: 'Você já possui um restaurante. Cada conta só pode ter um restaurante.' };
    }

    // 3. Create User record in database (using auth user ID)
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:47',message:'Before prisma.user.create',data:{userId:authData.user.id,prismaExists:!!prisma,prismaConstructor:prisma?.constructor?.name,hasDatabaseUrl:!!process.env.DATABASE_URL},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    const user = existingUser || await prisma.user.create({
      data: {
        id: authData.user.id,
        email: data.email,
        name: data.name,
      },
    });

    // 4. Create Restaurant with trial plan
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days trial

    const restaurant = await prisma.restaurant.create({
      data: {
        name: data.restaurantName,
        plan: 'TRIAL',
        trialEndsAt,
      },
    });

    // 5. Create Membership with OWNER role
    await prisma.membership.create({
      data: {
        restaurantId: restaurant.id,
        userId: user.id,
        role: 'OWNER',
        active: true,
      },
    });

    return { success: true, userId: user.id };
  } catch (error: any) {
    console.error('Registration error:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/167dfa8d-f908-443f-9592-ef5a733db0c8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/register/actions.ts:83',message:'Registration error caught',data:{errorMessage:error?.message,errorCode:error?.code,errorName:error?.name,errorStack:error?.stack?.substring(0,300),hasDatabaseUrl:!!process.env.DATABASE_URL,isEngineClientError:error?.message?.includes('engine type "client"')||false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
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
