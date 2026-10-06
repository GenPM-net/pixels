// Tablas de @core/pixels. Las recoge drizzle-kit vía src/lib/db/drizzle.config.ts.
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Atribución guardada al empezar un proceso (p. ej. el checkout) para enviar la conversión desde el servidor cuando
 * llegue el pago: consentimiento vigente e identificadores de primera parte. Caduca a los 7 días.
 */
export const pixelAttributions = pgTable('pixel_attributions', {
  key: text('key').primaryKey(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});
