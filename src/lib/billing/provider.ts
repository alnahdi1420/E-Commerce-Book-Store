/**
 * Billing abstraction (not wired to any payment gateway in the MVP).
 *
 * Plans and limits live in the `plans` table and are enforced in the database.
 * `subscriptions` mirrors the state a future provider reports (e.g. Moyasar, Tap, HyperPay, Stripe).
 * To add one:
 *   1. implement BillingProvider below (hosted checkout only — never store card data),
 *   2. add a signature-verified webhook route that calls an admin-only SQL function to update
 *      `subscriptions` and `workspaces.plan_id`,
 *   3. show prices only after the provider is live.
 */
export interface BillingProvider {
  readonly id: string;
  createCheckout(input: { workspaceId: string; planId: string; returnUrl: string }): Promise<{ url: string }>;
  createPortal?(input: { workspaceId: string; returnUrl: string }): Promise<{ url: string }>;
}

export const billingEnabled = false as const;
