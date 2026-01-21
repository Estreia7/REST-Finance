import { PrismaClient, MembershipRole, CategoryType, CostType, Plan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Demo Bistro',
      plan: Plan.TRIAL,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const owner = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: 'owner@example.com',
      name: 'Demo Owner'
    }
  });

  const staff = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: 'staff@example.com',
      name: 'Demo Staff'
    }
  });

  await prisma.membership.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        userId: owner.id,
        role: MembershipRole.OWNER
      },
      {
        restaurantId: restaurant.id,
        userId: staff.id,
        role: MembershipRole.STAFF
      }
    ]
  });

  const revenueCategory = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      type: CategoryType.REVENUE,
      name: 'Food'
    }
  });

  const cogsCategory = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      type: CategoryType.COGS,
      name: 'Ingredients'
    }
  });

  const opexCategory = await prisma.category.create({
    data: {
      restaurantId: restaurant.id,
      type: CategoryType.OPEX,
      name: 'Rent'
    }
  });

  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await prisma.dailySummary.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        date: today,
        dineInRevenue: 1200,
        takeawayRevenue: 300,
        revenueTotal: 1500,
        dineInTickets: 80,
        takeawayTickets: 25,
        createdById: owner.id
      },
      {
        restaurantId: restaurant.id,
        date: yesterday,
        dineInRevenue: 1000,
        takeawayRevenue: 250,
        revenueTotal: 1250,
        dineInTickets: 70,
        takeawayTickets: 20,
        createdById: owner.id
      }
    ]
  });

  await prisma.costEntry.createMany({
    data: [
      {
        restaurantId: restaurant.id,
        date: today,
        type: CostType.COGS,
        categoryId: cogsCategory.id,
        amount: 500,
        description: 'Food ingredients',
        createdById: owner.id
      },
      {
        restaurantId: restaurant.id,
        date: today,
        type: CostType.OPEX,
        categoryId: opexCategory.id,
        amount: 300,
        description: 'Rent',
        createdById: owner.id
      }
    ]
  });

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

