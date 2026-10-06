// @core/pixels — API pública del servidor. Cliente (PixelScripts, track, newEventId) en `./client.js`.
export {
  type Attribution,
  attributionFromRequest,
  browserCalls,
  ga4,
  meta,
  type PixelPlatform,
  pruneAttributions,
  registerPixelPlatform,
  saveAttribution,
  takeAttribution,
  type TrackResult,
  tiktok,
  trackServer,
} from './pixels.ts';
export { pixelAttributions } from './schema.ts';
