# @core/pixels

[![genpm](https://api.genpm.net/v1/badge/@core/pixels.svg)](https://genpm.net/p/@core/pixels) ![license](https://img.shields.io/badge/license-MIT-blue)

> Conversion tracking with consent: GA4, Meta Pixel + Conversions API, TikTok Pixel + Events API, deduplicated event ids

A [GenPM](https://genpm.net) module: **source code + AI rules + MCP config**, injected into your project instead of hidden in `node_modules`. The code lands in `src/lib/pixels`, pinned to a verified commit, and you own it.

## Install

```bash
genpm add @core/pixels
```

No genpm yet? `curl -fsSL https://genpm.net/install.sh | sh` (macOS/Linux), `irm https://genpm.net/install.ps1 | iex` (Windows), or one-off with `npx @genpm-net/cli add @core/pixels`.

Or let your AI agent do it: run `genpm mcp setup` once, then ask *"add @core/pixels with genpm"* in Claude Code, Cursor, VS Code, Windsurf, Codex or Gemini CLI. It shows you a dry-run plan before writing anything.

## What it does

One place to measure business events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `lead` from
@core/contracts) in GA4, Meta and TikTok: browser pixels loaded only inside `ConsentGate` (@core/consent) and
server-side events (GA4 Measurement Protocol, Meta Conversions API, TikTok Events API) sent only with consent, with
the same `eventId` on both sides so platforms deduplicate. Emails/phones are SHA-256 hashed. Never throws on vendor errors.

## Setup

After `genpm add`, follow these steps (your AI agent finds the same steps in `src/lib/pixels/AGENTS.md` and can do them for you):

1. Env (all optional; a platform is active only with both of its vars): `GA4_MEASUREMENT_ID` + `GA4_API_SECRET`,
   `META_PIXEL_ID` + `META_CAPI_TOKEN` (optional `META_GRAPH_VERSION`, `META_TEST_EVENT_CODE`), `TIKTOK_PIXEL_ID` + `TIKTOK_EVENTS_TOKEN`.
   Check each platform's current API version and event names before going live.
2. Layout: `<ConsentGate category="analytics"><PixelScripts ga4MeasurementId=… /></ConsentGate>` and
   `<ConsentGate category="marketing"><PixelScripts metaPixelId=… tiktokPixelId=… /></ConsentGate>`.
   `PixelScripts` renders nothing: once mounted (i.e. with consent) it injects each platform's loader into `<head>` once
   per page, so re-mounts don't repeat `config`/`PageView`. A CSP must allow those script and connect origins.
3. Browser events: `const eventId = newEventId(); track({ type: 'add_to_cart', eventId, … })` and send the same `eventId` to the server if it also tracks it.
4. Purchases: after `startCheckout` returns `{ sessionId }`, `saveAttribution("checkout:" + sessionId, attributionFromRequest(req))`;
   when the order is paid (@core/orders `onOrderEvent('paid')`), `trackServer(purchaseEvent(order), await takeAttribution("checkout:" + order.cartId))`
   (@core/checkout stores the Stripe session id in `order.cartId`; `purchaseEvent` comes from @core/checkout).
5. Verify with each platform's test tools (GA4 DebugView, Meta Test Events, TikTok Test Events).

## What's inside

Paths are relative to `src/lib/pixels`.

- `index.ts` — server: `trackServer`, `attributionFromRequest`, `saveAttribution`, `takeAttribution`, `browserCalls`, `registerPixelPlatform`.
- `client.ts` — client: `PixelScripts`, `track`, `newEventId`. `browser.ts` — `browserCalls` (no server code; safe in the browser).
- `schema.ts` — `pixel_attributions` (consent + first-party ids kept until the payment webhook, 7 days).

## At a glance

- **GenPM dependencies** (installed with it): [@core/consent](https://genpm.net/p/@core/consent), [@core/antispam](https://genpm.net/p/@core/antispam), [@core/contracts](https://genpm.net/p/@core/contracts), [@core/money](https://genpm.net/p/@core/money), [@core/db](https://genpm.net/p/@core/db)
- **npm dependencies** (proposed, never installed without asking): `react`
- **Environment variables** (added to `.env.example`): `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `META_PIXEL_ID`, `META_CAPI_TOKEN`, `TIKTOK_PIXEL_ID`, `TIKTOK_EVENTS_TOKEN`
- **AI rules**: [`AGENTS.md`](AGENTS.md), loaded by your agent only when it works in `src/lib/pixels`

## Security

GenPM installs a 40-character commit SHA (never a branch), verifies an Ed25519-signed manifest, never runs install scripts and scans AI rules for prompt injection. Details: [genpm.net/docs/security](https://genpm.net/docs/security).

## License

MIT — see [LICENSE](LICENSE). Browse the full catalog at [genpm.net](https://genpm.net).
