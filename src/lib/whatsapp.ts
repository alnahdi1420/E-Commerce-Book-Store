import { phoneDigits } from "./phone";

/**
 * WhatsApp Click-to-Chat link. Opens a chat with the number and a pre-filled message
 * in whatever WhatsApp account is signed in on the user's device. It does NOT send anything:
 * the user must press "send" inside WhatsApp.
 */
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${phoneDigits(e164)}?text=${encodeURIComponent(text)}`;
}
