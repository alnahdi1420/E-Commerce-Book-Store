/**
 * Messaging provider abstraction.
 *
 * Phase 1 (live): "manual" — the organizer opens a wa.me Click-to-Chat link and presses send
 * in their own WhatsApp. Nothing is sent by the server, and no delivery/read state exists.
 *
 * Phase 2 (not implemented): an official WhatsApp Business Platform (Cloud API) provider.
 * Requirements before enabling it for a workspace:
 *   - a verified WhatsApp Business Account + phone number owned by that workspace
 *   - approved message templates (invitations are "utility"/"marketing" category per Meta rules)
 *   - documented recipient opt-in, per-conversation pricing shown to the customer
 *   - a webhook endpoint (signature-verified with the app secret) that maps
 *     sent/delivered/read/failed statuses and button replies onto event_guests
 * Unofficial automation (WhatsApp Web scraping, session hijacking, bulk sending from a personal
 * number) is out of scope and must never be added.
 */

export type DeliveryState = "not_started" | "opened" | "sent" | "delivered" | "read" | "failed";

export interface OutgoingInvitation {
  guestId: string;
  toE164: string;
  text: string;
  inviteUrl: string;
}

export interface MessagingProvider {
  readonly id: "manual" | "whatsapp_cloud";
  /** true only for providers that send from the server. */
  readonly canSendAutomatically: boolean;
  /** true only when the provider reports real delivery receipts. */
  readonly hasDeliveryReceipts: boolean;
  /** Manual: returns a link for the user to open. Cloud: sends and returns a provider message id. */
  prepare(msg: OutgoingInvitation): Promise<{ kind: "link"; url: string } | { kind: "sent"; providerMessageId: string }>;
}

export function manualProvider(buildLink: (to: string, text: string) => string): MessagingProvider {
  return {
    id: "manual",
    canSendAutomatically: false,
    hasDeliveryReceipts: false,
    async prepare(msg) {
      return { kind: "link", url: buildLink(msg.toE164, msg.text) };
    },
  };
}
