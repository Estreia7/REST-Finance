/**
 * The demonstration restaurant.
 *
 * One definition rather than a literal repeated across actions, scripts and
 * panels: the address decides who may replay the walkthrough on demand, and a
 * copy that drifts would quietly hand that to the wrong account — or take it
 * away from the demo.
 */
export const DEMO_EMAIL = 'demo@rest-finance.com';

/** Whether this address is the demo account. */
export function isDemoAccount(email: string | null | undefined): boolean {
  return email?.toLowerCase() === DEMO_EMAIL;
}
