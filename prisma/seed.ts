import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Plans
  const plans = [
    {
      name: 'Free',
      slug: 'free',
      priceInRupees: 0,
      sourcingCredits: 5,
      screeningCredits: 10,
      billingCycle: 'monthly',
      isActive: true,
    },
    {
      name: 'Starter',
      slug: 'starter',
      priceInRupees: 1499,
      sourcingCredits: 25,
      screeningCredits: 50,
      billingCycle: 'monthly',
      isActive: true,
    },
    {
      name: 'Pro',
      slug: 'pro',
      priceInRupees: 3499,
      sourcingCredits: 75,
      screeningCredits: 150,
      billingCycle: 'monthly',
      isActive: true,
    },
    {
      name: 'Max',
      slug: 'max',
      priceInRupees: 5999,
      sourcingCredits: 150,
      screeningCredits: 300,
      billingCycle: 'monthly',
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const existingPlan = await prisma.plan.findUnique({
      where: { slug: plan.slug },
    });

    if (existingPlan) {
      console.log(`✓ Plan "${plan.name}" already exists, skipping...`);
      continue;
    }

    await prisma.plan.create({
      data: plan,
    });

    console.log(`✓ Created plan: ${plan.name} (₹${plan.priceInRupees})`);
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
