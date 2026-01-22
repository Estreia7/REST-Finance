import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }

  return user;
}

export async function getUserRestaurant() {
  const user = await getCurrentUser();
  
  if (!user) {
    return null;
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      role: 'OWNER',
      active: true,
    },
    include: {
      restaurant: true,
    },
  });

  return membership?.restaurant || null;
}
