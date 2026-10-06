'use client';
// Cliente: carga los píxeles (solo dentro de <ConsentGate>) y envía eventos con el mismo eventId que el servidor.
import { createElement as h, type ReactNode, useEffect } from 'react';
import type { TrackedEvent } from '../contracts/index.ts';
import { browserCalls } from './browser.ts';

type W = Window & { gtag?: (...a: unknown[]) => void; fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void } };

/** Envía el evento a las librerías cargadas en la página (las que no estén, se ignoran). */
export function track(e: TrackedEvent): void {
  const w = window as W;
  const calls = browserCalls(e);
  w.gtag?.(...calls.gtag);
  w.fbq?.(...calls.fbq);
  w.ttq?.track(...calls.ttq);
}

/** Id de evento nuevo para compartir entre navegador y servidor. */
export const newEventId = () => `evt_${crypto.randomUUID().replaceAll('-', '')}`;

const inline = (code: string) => h('script', { dangerouslySetInnerHTML: { __html: code } });

/**
 * Cargadores oficiales de cada plataforma con sus ids (públicos). Ponlo SIEMPRE dentro de `<ConsentGate>`:
 * `<ConsentGate category="marketing"><PixelScripts metaPixelId=… tiktokPixelId=… /></ConsentGate>` y GA4 dentro de "analytics".
 */
export function PixelScripts(props: { ga4MeasurementId?: string; metaPixelId?: string; tiktokPixelId?: string }): ReactNode {
  const id = (s?: string) => (s && /^[A-Za-z0-9-]{4,40}$/.test(s) ? s : undefined);
  const ga = id(props.ga4MeasurementId);
  const metaId = id(props.metaPixelId);
  const tt = id(props.tiktokPixelId);
  useEffect(() => {
    if (ga) (window as W).gtag?.('config', ga, { send_page_view: true });
  }, [ga]);
  return h(
    'span',
    { hidden: true },
    ga && h('script', { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ga}` }),
    ga && inline(`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ga}');`),
    metaId &&
      inline(
        `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaId}');fbq('track','PageView');`,
      ),
    tt &&
      inline(
        `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._t=ttq._t||{};ttq._t[e]=+new Date;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page()}(window,document,'ttq');`,
      ),
  );
}
