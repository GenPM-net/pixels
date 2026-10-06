# @core/pixels — rules for AI agents

## Purpose
One place to measure business events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `lead` from
@core/contracts) in GA4, Meta and TikTok: browser pixels loaded only inside `ConsentGate` (@core/consent) and
server-side events (GA4 Measurement Protocol, Meta Conversions API, TikTok Events API) sent only with consent, with
the same `eventId` on both sides so platforms deduplicate. Emails/phones are SHA-256 hashed. Never throws on vendor errors.

## Map
- `index.ts` — server: `trackServer`, `attributionFromRequest`, `saveAttribution`, `takeAttribution`, `browserCalls`, `registerPixelPlatform`.
- `client.ts` — client: `PixelScripts`, `track`, `newEventId`.
- `schema.ts` — `pixel_attributions` (consent + first-party ids kept until the payment webhook, 7 days).

## Integration
1. Env (all optional; a platform is active only with both of its vars): `GA4_MEASUREMENT_ID` + `GA4_API_SECRET`,
   `META_PIXEL_ID` + `META_CAPI_TOKEN` (optional `META_GRAPH_VERSION`, `META_TEST_EVENT_CODE`), `TIKTOK_PIXEL_ID` + `TIKTOK_EVENTS_TOKEN`.
   Check each platform's current API version and event names before going live.
2. Layout: `<ConsentGate category="analytics"><PixelScripts ga4MeasurementId=… /></ConsentGate>` and
   `<ConsentGate category="marketing"><PixelScripts metaPixelId=… tiktokPixelId=… /></ConsentGate>`.
3. Browser events: `const eventId = newEventId(); track({ type: 'add_to_cart', eventId, … })` and send the same `eventId` to the server if it also tracks it.
4. Purchases: after `startCheckout` returns `{ sessionId }`, `saveAttribution("checkout:" + sessionId, attributionFromRequest(req))`;
   when the order is paid (@core/orders `onOrderEvent('paid')`), `trackServer(purchaseEvent(order), await takeAttribution("checkout:" + order.cartId))`
   (@core/checkout stores the Stripe session id in `order.cartId`; `purchaseEvent` comes from @core/checkout).
5. Verify with each platform's test tools (GA4 DebugView, Meta Test Events, TikTok Test Events).

## Conventions
- List in the privacy policy what each platform receives (events, hashed email, IP, user agent, click ids).
- Use real values only; `purchase` uses the order total and the order id.

## Don't
- Don't load pixels or call `trackServer` without the matching consent category.
- Don't send raw emails, phones, names or addresses to ad platforms.
- Don't invent events (fake purchases to "train" campaigns) or fire `purchase` from the success page without an order.
