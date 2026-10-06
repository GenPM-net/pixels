'use client';
// Cliente: carga los píxeles (solo dentro de <ConsentGate>) y envía eventos con el mismo eventId que el servidor.
import { type ReactNode, useEffect } from 'react';
import type { TrackedEvent } from '../contracts/index.ts';
import { browserCalls } from './browser.ts';

type W = Window & { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void } };

/**
 * Envía el evento a las librerías cargadas en la página (las que no estén, se ignoran). Se aplaza a la siguiente tarea:
 * así un `track()` en el efecto de una página llega después de que `<PixelScripts>` (más abajo en el árbol) prepare las colas.
 */
export function track(e: TrackedEvent): void {
  setTimeout(() => {
    const w = window as W;
    const calls = browserCalls(e);
    w.gtag?.(...calls.gtag);
    w.fbq?.(...calls.fbq);
    w.ttq?.track(...calls.ttq);
  }, 0);
}

/** Id de evento nuevo para compartir entre navegador y servidor. */
export const newEventId = () => `evt_${crypto.randomUUID().replaceAll('-', '')}`;

const validId = (s?: string) => (s && /^[A-Za-z0-9-]{4,40}$/.test(s) ? s : undefined);

/** Cada cargador se instala una sola vez por página (sobrevive a desmontajes, navegaciones y recargas del módulo). */
function once(key: string): boolean {
  const w = window as W & { __genpmPixels?: Set<string> };
  w.__genpmPixels ??= new Set();
  if (w.__genpmPixels.has(key)) return false;
  w.__genpmPixels.add(key);
  return true;
}

function loadScript(src: string): void {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// Colas oficiales de cada plataforma (equivalentes a sus fragmentos, sin `<script>` en línea): las llamadas se guardan
// hasta que llega la librería, que las procesa al cargar.
type Stub = ((...a: unknown[]) => void) & Record<string, unknown>;

function installGa4(id: string): void {
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
  w.dataLayer ??= [];
  w.gtag ??= function gtag() {
    // gtag.js espera el objeto `arguments`, no un array.
    w.dataLayer!.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', id); // envía el page_view una vez; las navegaciones las mide GA4 (historial del navegador).
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${id}`);
}

function installMeta(id: string): void {
  const w = window as unknown as { fbq?: Stub; _fbq?: Stub };
  if (!w.fbq) {
    const n = function fbq() {
      // fbevents.js procesa la cola de objetos `arguments`.
      n.callMethod ? (n.callMethod as (...a: unknown[]) => void).apply(n, arguments as unknown as unknown[]) : (n.queue as unknown[]).push(arguments);
    } as Stub;
    Object.assign(n, { push: n, loaded: true, version: '2.0', queue: [] });
    w.fbq = n;
    w._fbq ??= n;
    loadScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  w.fbq('init', id);
  w.fbq('track', 'PageView');
}

function installTiktok(id: string): void {
  const w = window as unknown as { TiktokAnalyticsObject?: string; ttq?: unknown[] & Record<string, unknown> };
  w.TiktokAnalyticsObject = 'ttq';
  const ttq = (w.ttq ??= [] as unknown as unknown[] & Record<string, unknown>);
  if (typeof ttq.load !== 'function') {
    const methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    const setAndDefer = (t: unknown[] & Record<string, unknown>, m: string) => {
      t[m] = (...a: unknown[]) => void t.push([m, ...a]);
    };
    Object.assign(ttq, { methods, setAndDefer });
    for (const m of methods) setAndDefer(ttq, m);
    ttq.load = (e: string) => {
      ttq._i ??= {};
      (ttq._i as Record<string, unknown>)[e] = [];
      ttq._t ??= {};
      (ttq._t as Record<string, number>)[e] = Date.now();
      loadScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${e}&lib=ttq`);
    };
  }
  (ttq.load as (e: string) => void)(id);
  (ttq.page as () => void)();
}

/**
 * Cargadores oficiales de cada plataforma con sus ids (públicos). Ponlo SIEMPRE dentro de `<ConsentGate>`:
 * `<ConsentGate category="marketing"><PixelScripts metaPixelId=… tiktokPixelId=… /></ConsentGate>` y GA4 dentro de "analytics".
 * Inyecta los scripts al montarse (React no ejecuta `<script>` creados en el cliente) y una sola vez por página:
 * volver a montarlo (p. ej. al cambiar el consentimiento o de ruta) no repite `config` ni el PageView.
 */
export function PixelScripts(props: { ga4MeasurementId?: string; metaPixelId?: string; tiktokPixelId?: string }): ReactNode {
  const ga = validId(props.ga4MeasurementId);
  const metaId = validId(props.metaPixelId);
  const tt = validId(props.tiktokPixelId);
  useEffect(() => {
    if (ga && once(`ga4:${ga}`)) installGa4(ga);
    if (metaId && once(`meta:${metaId}`)) installMeta(metaId);
    if (tt && once(`tiktok:${tt}`)) installTiktok(tt);
  }, [ga, metaId, tt]);
  return null;
}
