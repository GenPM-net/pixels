import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordConsent } from '../consent/index.js';
import * as consentSchema from '../consent/schema.js';
import type { CommerceEvent } from '../contracts/index.js';
import { testDb } from '../db/__fixtures__/pglite.js';
import { money } from '../money/index.js';
import { PixelScripts } from './client.js';
import * as schema from './schema.js';
import { type Attribution, attributionFromRequest, browserCalls, saveAttribution, takeAttribution, trackServer } from './index.js';

const purchase: CommerceEvent = {
  type: 'purchase',
  eventId: 'ord_01HZZZZZZZZZZZZZZZZZZZZZZZ',
  orderId: '1001',
  value: money(3399, 'EUR'),
  items: [{ id: 'var_1', name: 'Mug', price: money(1500, 'EUR'), quantity: 2 }],
};
const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
  return new Response('{}', { status: url.includes('tiktok') ? 500 : 200 });
}) as unknown as typeof fetch;
const full: Attribution = { consent: { analytics: true, marketing: true }, gaClientId: '123.456', fbp: 'fb.1.1.1', ip: '203.0.113.5', userAgent: 'UA', email: ' Ana@X.test ', url: 'https://shop.test/checkout' };

beforeEach(async () => {
  await testDb(consentSchema, schema);
  calls.length = 0;
  Object.assign(process.env, { GA4_MEASUREMENT_ID: 'G-TEST1', GA4_API_SECRET: 'sec', META_PIXEL_ID: '1234', META_CAPI_TOKEN: 'tok', TIKTOK_PIXEL_ID: 'TT123', TIKTOK_EVENTS_TOKEN: 'ttt', CONSENT_POLICY_VERSION: '1' });
});

describe('server events', () => {
  it('sends nothing without consent and skips platforms without config', async () => {
    delete process.env.TIKTOK_EVENTS_TOKEN;
    const r = await trackServer(purchase, { consent: { analytics: false, marketing: false } }, { fetch: fakeFetch });
    expect(r).toEqual([
      { platform: 'ga4', status: 'skipped_consent' },
      { platform: 'meta', status: 'skipped_consent' },
      { platform: 'tiktok', status: 'skipped_config' },
    ]);
    expect(calls).toHaveLength(0);
  });

  it('builds GA4, Meta CAPI and TikTok payloads with the same event id and hashed email; failures never throw', async () => {
    const r = await trackServer(purchase, full, { fetch: fakeFetch });
    expect(r.map((x) => [x.platform, x.status])).toEqual([['ga4', 'sent'], ['meta', 'sent'], ['tiktok', 'failed']]);
    const [ga, fb, tt] = calls;
    expect(ga!.url).toContain('measurement_id=G-TEST1');
    expect(ga!.body).toMatchObject({ client_id: '123.456', events: [{ name: 'purchase', params: { event_id: purchase.eventId, currency: 'EUR', value: 33.99, transaction_id: '1001' } }] });
    expect(fb!.url).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/1234\/events$/);
    const d = (fb!.body.data as Array<Record<string, any>>)[0]!;
    expect(d).toMatchObject({ event_name: 'Purchase', event_id: purchase.eventId, action_source: 'website', custom_data: { value: 33.99, order_id: '1001', content_ids: ['var_1'], num_items: 2 } });
    expect(d.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fb!.body)).not.toContain('ana@x.test');
    expect(tt!.headers.get('access-token')).toBe('ttt');
    expect(tt!.body).toMatchObject({ event_source: 'web', event_source_id: 'TT123', data: [{ event: 'CompletePayment', event_id: purchase.eventId }] });
  });

  it('marketing consent alone sends Meta/TikTok; GA4 needs the browser client id', async () => {
    const r = await trackServer({ type: 'lead', eventId: 'evt_12345678' }, { consent: { analytics: true, marketing: false } }, { fetch: fakeFetch });
    expect(r.map((x) => x.status)).toEqual(['skipped_ids', 'skipped_consent', 'skipped_consent']);
    await expect(trackServer({ type: 'purchase', eventId: 'x' } as unknown as CommerceEvent, full, { fetch: fakeFetch })).rejects.toThrow();
  });
});

describe('attribution', () => {
  it('reads consent and first-party ids from the request and stores them once', async () => {
    const { setCookies } = await recordConsent({ choices: { marketing: true } });
    const req = new Request('https://shop.test/p/lamp?fbclid=ABC&ttclid=T1', {
      headers: { cookie: `${setCookies[0]!.split(';')[0]}; _ga=GA1.1.111.222; _fbp=fb.1.9.9`, 'user-agent': 'Mozilla', 'x-forwarded-for': '198.51.100.7' },
    });
    const a = attributionFromRequest(req);
    expect(a).toMatchObject({ consent: { analytics: false, marketing: true }, gaClientId: '111.222', fbp: 'fb.1.9.9', ttclid: 'T1', ip: '198.51.100.7', userAgent: 'Mozilla', url: 'https://shop.test/p/lamp' });
    expect(a.fbc).toMatch(/^fb\.1\.\d+\.ABC$/);
    await saveAttribution('crt_1', a);
    expect(await takeAttribution('crt_1')).toMatchObject({ fbp: 'fb.1.9.9' });
    expect(await takeAttribution('crt_1')).toBeNull();
  });
});

describe('browser', () => {
  it('browser calls share the event id; loaders only render valid ids', () => {
    const c = browserCalls(purchase);
    expect(c.fbq[3]).toEqual({ eventID: purchase.eventId });
    expect(c.gtag[2]).toMatchObject({ event_id: purchase.eventId, transaction_id: '1001' });
    const html = renderToStaticMarkup(createElement(PixelScripts, { metaPixelId: '1234', ga4MeasurementId: "G-1');alert(1)//" }));
    expect(html).toContain("fbq('init','1234')");
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('googletagmanager');
  });
});
