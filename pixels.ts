// Envío de eventos de conversión desde el servidor (GA4 Measurement Protocol, Meta Conversions API, TikTok Events API)
// y utilidades del navegador. Todo exige consentimiento: GA4 → analytics; Meta y TikTok → marketing.
import { eq, lt } from 'drizzle-orm';
import { clientIp } from '../antispam/index.ts';
import { getConsent } from '../consent/index.ts';
import { type TrackedEvent, TrackedEventSchema } from '../contracts/index.ts';
import { type Executor, getDb } from '../db/index.ts';
import { toDecimalString } from '../money/index.ts';
import { items, META_NAMES, TIKTOK_NAMES, value } from './browser.ts';
import { pixelAttributions } from './schema.ts';

export { browserCalls } from './browser.ts';

export type Attribution = {
  consent: { analytics: boolean; marketing: boolean };
  /** Cookies/IDs de primera parte de cada plataforma. */
  gaClientId?: string;
  fbp?: string;
  fbc?: string;
  ttp?: string;
  ttclid?: string;
  ip?: string;
  userAgent?: string;
  url?: string;
  /** Solo si la persona los dio (se envían con hash SHA-256 a Meta/TikTok). */
  email?: string;
  phone?: string;
};

const cookie = (header: string | null, name: string) => header?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);

/** Extrae de la petición el consentimiento y los identificadores de primera parte que usan las plataformas. */
export function attributionFromRequest(req: Request): Attribution {
  const ch = req.headers.get('cookie');
  const c = getConsent(ch);
  const url = new URL(req.url);
  const ga = cookie(ch, '_ga')?.split('.').slice(-2).join('.');
  const fbclid = url.searchParams.get('fbclid');
  return {
    consent: { analytics: c.choices.analytics, marketing: c.choices.marketing },
    ...(ga && { gaClientId: ga }),
    ...(cookie(ch, '_fbp') && { fbp: cookie(ch, '_fbp') }),
    ...((cookie(ch, '_fbc') || fbclid) && { fbc: cookie(ch, '_fbc') ?? `fb.1.${Date.now()}.${fbclid}` }),
    ...(cookie(ch, '_ttp') && { ttp: cookie(ch, '_ttp') }),
    ...((url.searchParams.get('ttclid') || cookie(ch, 'ttclid')) && { ttclid: url.searchParams.get('ttclid') ?? cookie(ch, 'ttclid') }),
    ...(clientIp(req.headers) && { ip: clientIp(req.headers)! }),
    ...(req.headers.get('user-agent') && { userAgent: req.headers.get('user-agent')!.slice(0, 300) }),
    url: `${url.origin}${url.pathname}`,
  };
}

export async function saveAttribution(key: string, a: Attribution, db: Executor = getDb()): Promise<void> {
  const data = { ...a } as Record<string, unknown>;
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(pixelAttributions).values({ key, data, expiresAt }).onConflictDoUpdate({ target: pixelAttributions.key, set: { data, expiresAt } });
}

/** Lee y borra la atribución (se usa una vez). */
export async function takeAttribution(key: string, db: Executor = getDb()): Promise<Attribution | null> {
  const rows = await db.delete(pixelAttributions).where(eq(pixelAttributions.key, key)).returning();
  const r = rows[0];
  return r && r.expiresAt > new Date() ? (r.data as unknown as Attribution) : null;
}

export async function pruneAttributions(db: Executor = getDb()): Promise<number> {
  return (await db.delete(pixelAttributions).where(lt(pixelAttributions.expiresAt, new Date())).returning({ k: pixelAttributions.key })).length;
}

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const normEmail = (e: string) => e.trim().toLowerCase();
const normPhone = (p: string) => p.replace(/[^\d]/g, '');


type Payload = { url: string; init: RequestInit };

export type PixelPlatform = {
  name: string;
  /** Categoría de consentimiento que exige. */
  consent: 'analytics' | 'marketing';
  enabled(): boolean;
  build(event: TrackedEvent, a: Attribution): Promise<Payload | null>;
};


export const ga4: PixelPlatform = {
  name: 'ga4',
  consent: 'analytics',
  enabled: () => !!process.env.GA4_MEASUREMENT_ID && !!process.env.GA4_API_SECRET,
  async build(e, a) {
    if (!a.gaClientId) return null; // GA4 MP necesita el client_id del navegador
    const v = value(e);
    const params: Record<string, unknown> = {
      event_id: e.eventId,
      ...(v && { currency: v.currency, value: Number(toDecimalString(v)) }),
      ...(e.type === 'purchase' && { transaction_id: e.orderId }),
      ...(items(e).length && { items: items(e).map((i) => ({ item_id: i.id, item_name: i.name, price: Number(toDecimalString(i.price)), quantity: i.quantity, ...(i.variant && { item_variant: i.variant }) })) }),
    };
    const name = e.type === 'lead' ? 'generate_lead' : e.type;
    return {
      url: `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(process.env.GA4_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET!)}`,
      init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: a.gaClientId, events: [{ name, params }] }) },
    };
  },
};

export const meta: PixelPlatform = {
  name: 'meta',
  consent: 'marketing',
  enabled: () => !!process.env.META_PIXEL_ID && !!process.env.META_CAPI_TOKEN,
  async build(e, a) {
    const v = value(e);
    const user_data: Record<string, unknown> = {
      ...(a.email && { em: [await sha256(normEmail(a.email))] }),
      ...(a.phone && { ph: [await sha256(normPhone(a.phone))] }),
      ...(a.ip && { client_ip_address: a.ip }),
      ...(a.userAgent && { client_user_agent: a.userAgent }),
      ...(a.fbp && { fbp: a.fbp }),
      ...(a.fbc && { fbc: a.fbc }),
    };
    const data = {
      event_name: META_NAMES[e.type],
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      action_source: 'website',
      ...(a.url && { event_source_url: a.url }),
      user_data,
      custom_data: {
        ...(v && { currency: v.currency, value: Number(toDecimalString(v)) }),
        ...(items(e).length && { content_type: 'product', content_ids: items(e).map((i) => i.id), contents: items(e).map((i) => ({ id: i.id, quantity: i.quantity, item_price: Number(toDecimalString(i.price)) })), num_items: items(e).reduce((n, i) => n + i.quantity, 0) }),
        ...(e.type === 'purchase' && { order_id: e.orderId }),
      },
    };
    const version = process.env.META_GRAPH_VERSION ?? 'v23.0';
    return {
      url: `https://graph.facebook.com/${version}/${encodeURIComponent(process.env.META_PIXEL_ID!)}/events`,
      init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [data], access_token: process.env.META_CAPI_TOKEN, ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }) }) },
    };
  },
};

export const tiktok: PixelPlatform = {
  name: 'tiktok',
  consent: 'marketing',
  enabled: () => !!process.env.TIKTOK_PIXEL_ID && !!process.env.TIKTOK_EVENTS_TOKEN,
  async build(e, a) {
    const v = value(e);
    const data = {
      event: TIKTOK_NAMES[e.type],
      event_time: Math.floor(Date.now() / 1000),
      event_id: e.eventId,
      user: {
        ...(a.email && { email: await sha256(normEmail(a.email)) }),
        ...(a.phone && { phone: await sha256(normPhone(a.phone)) }),
        ...(a.ip && { ip: a.ip }),
        ...(a.userAgent && { user_agent: a.userAgent }),
        ...(a.ttclid && { ttclid: a.ttclid }),
        ...(a.ttp && { ttp: a.ttp }),
      },
      properties: {
        ...(v && { currency: v.currency, value: Number(toDecimalString(v)) }),
        ...(items(e).length && { content_type: 'product', contents: items(e).map((i) => ({ content_id: i.id, content_name: i.name, quantity: i.quantity, price: Number(toDecimalString(i.price)) })) }),
        ...(e.type === 'purchase' && { order_id: e.orderId }),
      },
      ...(a.url && { page: { url: a.url } }),
    };
    return {
      url: 'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      init: { method: 'POST', headers: { 'content-type': 'application/json', 'Access-Token': process.env.TIKTOK_EVENTS_TOKEN! }, body: JSON.stringify({ event_source: 'web', event_source_id: process.env.TIKTOK_PIXEL_ID, data: [data] }) },
    };
  },
};

const platforms: PixelPlatform[] = [ga4, meta, tiktok];
/** Añade otra plataforma (Pinterest, Snap…) con la misma forma. */
export const registerPixelPlatform = (p: PixelPlatform) => void platforms.push(p);

export type TrackResult = Array<{ platform: string; status: 'sent' | 'skipped_consent' | 'skipped_config' | 'skipped_ids' | 'failed'; error?: string }>;

/**
 * Envía un evento a las plataformas configuradas que tengan consentimiento. Nunca lanza: devuelve el resultado por
 * plataforma (los fallos de terceros no deben romper un pago).
 */
export async function trackServer(event: TrackedEvent, a: Attribution, opts: { fetch?: typeof fetch } = {}): Promise<TrackResult> {
  const e = TrackedEventSchema.parse(event);
  const doFetch = opts.fetch ?? fetch;
  const out: TrackResult = [];
  for (const p of platforms) {
    if (!p.enabled()) {
      out.push({ platform: p.name, status: 'skipped_config' });
      continue;
    }
    if (!a.consent[p.consent]) {
      out.push({ platform: p.name, status: 'skipped_consent' });
      continue;
    }
    const payload = await p.build(e, a);
    if (!payload) {
      out.push({ platform: p.name, status: 'skipped_ids' });
      continue;
    }
    try {
      const res = await doFetch(payload.url, { ...payload.init, signal: AbortSignal.timeout(5000) });
      out.push(res.ok ? { platform: p.name, status: 'sent' } : { platform: p.name, status: 'failed', error: `HTTP ${res.status}` });
    } catch (err) {
      out.push({ platform: p.name, status: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/**
 * Llamadas del navegador equivalentes (para `track()` en el cliente): mismo `eventId` que el servidor para deduplicar.
 * Devuelve las instrucciones como datos; `client.ts` las ejecuta si las librerías están cargadas.
 */
