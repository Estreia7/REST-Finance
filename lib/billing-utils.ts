// Pure billing utility functions (no server actions, safe to import anywhere)

export function isSubscriptionActive(status: {
  plan: string;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): boolean {
  const now = new Date();

  if (status.plan === 'TRIAL') {
    if (!status.trialEndsAt) return true;
    return status.trialEndsAt > now;
  }

  if (status.subscriptionStatus === 'active') return true;
  if (status.subscriptionStatus === 'past_due') return true;

  return false;
}

export function trialDaysLeft(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 30;
  const diff = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
