// Parte de los píxeles sin servidor ni base de datos: la usan el navegador (`client.ts`) y el servidor.
import type { TrackedEvent } from '../contracts/index.ts';
import { toDecimalString } from '../money/index.ts';

export const META_NAMES = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase', lead: 'Lead' } as const;
export const TIKTOK_NAMES = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'CompletePayment', lead: 'SubmitForm' } as const;
export const value = (e: TrackedEvent) => ('value' in e && e.value ? e.value : null);
export const items = (e: TrackedEvent) => ('items' in e ? e.items : []);

/** Llamadas equivalentes de gtag, fbq y ttq para un evento (mismo `eventId` que el servidor). */
export function browserCalls(e: TrackedEvent) {
  const v = value(e);
  const common = { ...(v && { currency: v.currency, value: Number(toDecimalString(v)) }) };
  return {
    gtag: ['event', e.type === 'lead' ? 'generate_lead' : e.type, { ...common, event_id: e.eventId, ...(e.type === 'purchase' && { transaction_id: e.orderId }) }] as const,
    fbq: ['track', META_NAMES[e.type], { ...common, ...(items(e).length && { content_ids: items(e).map((i) => i.id), content_type: 'product' }) }, { eventID: e.eventId }] as const,
    ttq: [TIKTOK_NAMES[e.type], { ...common, event_id: e.eventId }] as const,
  };
}
