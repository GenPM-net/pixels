// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConsentBanner, ConsentGate } from '../consent/react.ts';
import { PixelScripts, track } from './client.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Win = Window & Record<string, unknown> & { dataLayer?: IArguments[]; fbq?: { queue: IArguments[] }; ttq?: unknown[] };
const w = window as unknown as Win;
let roots: Root[] = [];

const consentCookie = (v: string, c: Record<string, boolean>) =>
  `consent=${encodeURIComponent(btoa(JSON.stringify({ s: 'cns_01HZZZZZZZZZZZZZZZZZZZZZZZ', v, c })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''))}; path=/`;

async function mount(node: ReactNode) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => root.render(node));
  return root;
}
const scripts = () => [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
const tracking = (v = '2026-10') =>
  h(
    'div',
    null,
    h(ConsentBanner, { policyVersion: v, policyHref: '/cookies' }),
    h(ConsentGate, { category: 'analytics' }, h(PixelScripts, { ga4MeasurementId: 'G-TEST1' })),
    h(ConsentGate, { category: 'marketing' }, h(PixelScripts, { metaPixelId: '1234', tiktokPixelId: 'TT123' })),
  );

beforeEach(() => {
  document.cookie = 'consent=; path=/; max-age=0';
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  for (const k of ['dataLayer', 'gtag', 'fbq', '_fbq', 'ttq', 'TiktokAnalyticsObject', '__genpmPixels']) delete w[k];
});
afterEach(async () => {
  for (const r of roots) await act(async () => r.unmount());
  roots = [];
});

describe('PixelScripts in the browser', () => {
  it('loads every pixel once consent is given, and re-mounting does not repeat config or PageView', async () => {
    document.cookie = consentCookie('2026-10', { analytics: true, marketing: true });
    const first = await mount(tracking());
    expect(scripts()).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-TEST1',
      'https://connect.facebook.net/en_US/fbevents.js',
      'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=TT123&lib=ttq',
    ]);
    const configs = () => (w.dataLayer ?? []).filter((a) => a[0] === 'config').length;
    const pageViews = () => (w.fbq?.queue ?? []).filter((a) => a[0] === 'track' && a[1] === 'PageView').length;
    expect([configs(), pageViews(), (w.ttq ?? []).filter((c) => (c as unknown[])[0] === 'page').length]).toEqual([1, 1, 1]);
    await act(async () => first.unmount());
    roots = [];
    await mount(tracking());
    expect(scripts()).toHaveLength(3);
    expect([configs(), pageViews()]).toEqual([1, 1]);
    track({ type: 'lead', eventId: 'evt_12345678' });
    await new Promise((r) => setTimeout(r, 5));
    expect((w.fbq?.queue ?? []).some((a) => a[1] === 'Lead' && (a[3] as { eventID: string }).eventID === 'evt_12345678')).toBe(true);
  });

  it('loads nothing without consent, with consent for an old policy version, or with invalid ids', async () => {
    await mount(tracking());
    document.cookie = consentCookie('2026-01', { analytics: true, marketing: true });
    await mount(tracking('2026-10'));
    document.cookie = consentCookie('2026-10', { analytics: true, marketing: true });
    await mount(h(ConsentGate, { category: 'marketing', policyVersion: '2026-10' }, h(PixelScripts, { metaPixelId: "1');alert(1)//" })));
    expect(scripts()).toEqual([]);
    expect(w.fbq).toBeUndefined();
  });
});
