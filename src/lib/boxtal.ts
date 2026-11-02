import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { PARCEL_SIZES, type ListingCategory, type ParcelPointOption, type ParcelSize, type ShippingOption } from '@/lib/bourse-shared';

/**
 * Boxtal : un seul compte pour Colissimo, Mondial Relay, Chronopost, Relais Colis…
 * - Cotation : API v1 (XML), la v3 n'en a pas encore.
 * - Bordereaux, suivi, points relais, notifications : API v3 (JSON).
 * Les deux acceptent les clés de l'application v3 en authentification « basic ».
 * Les bordereaux sont facturés au compte Boxtal de Tracteurs & Co (paiement différé par prélèvement).
 */

const sandbox = () => process.env.BOXTAL_SANDBOX === '1';
const V3 = () => (sandbox() ? 'https://api.boxtal.build/shipping' : 'https://api.boxtal.com/shipping');
const V1 = () => (sandbox() ? 'https://test.envoimoinscher.com/api/v1' : 'https://www.envoimoinscher.com/api/v1');

export function boxtalConfigured() {
  return Boolean(process.env.BOXTAL_ACCESS_KEY && process.env.BOXTAL_SECRET_KEY);
}
export const boxtalSandbox = sandbox;

export class BoxtalError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly codes: string[] = [],
    readonly fields: string[] = [],
  ) {
    super(message);
  }
}

function auth() {
  return 'Basic ' + Buffer.from(`${process.env.BOXTAL_ACCESS_KEY}:${process.env.BOXTAL_SECRET_KEY}`).toString('base64');
}

async function call(url: string, init: { method?: string; body?: unknown; accept: string; timeout?: number }) {
  if (!boxtalConfigured()) throw new BoxtalError('Boxtal n’est pas configuré (clés manquantes).');
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: auth(), Accept: init.accept, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init.timeout ?? 15_000),
    });
  } catch (err) {
    throw new BoxtalError(`Boxtal injoignable : ${err instanceof Error ? err.message : String(err)}`);
  }
  return res;
}

/** Appel à l'API v3 : renvoie le champ « content ». */
async function v3<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await call(V3() + path, { method, body, accept: 'application/json' });
  const text = await res.text();
  let data: { content?: unknown; errors?: { code?: string; parameters?: { code?: string; field?: string; value?: string }[] }[] } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new BoxtalError(`Réponse illisible de Boxtal (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok) {
    const errors = data.errors ?? [];
    const codes = errors.flatMap((e) => [e.code ?? '', ...(e.parameters ?? []).map((p) => p.code ?? '')]).filter(Boolean);
    const fields = errors.flatMap((e) => (e.parameters ?? []).map((p) => p.field ?? '')).filter(Boolean);
    const detail = errors.flatMap((e) => (e.parameters ?? []).map((p) => p.value ?? '')).filter(Boolean).join(' ; ');
    // Jamais le corps complet dans les journaux : il contient noms, adresses et téléphones.
    console.error('[boxtal] refus', method, path.split('?')[0], res.status, codes.join(','), fields.join(','));
    throw new BoxtalError(`Boxtal a refusé la demande (HTTP ${res.status})${detail ? ` : ${detail}` : ''}`, res.status, codes, fields);
  }
  return (data.content ?? []) as T;
}

// ---------------------------------------------------------------------
// Contenu du colis (catégorie Boxtal)
// ---------------------------------------------------------------------

/** « Pièces de rechange et accessoires (autres) », sauf l'outillage. */
export function contentCode(category: ListingCategory) {
  return category === 'outillage' ? '50450' : '50150';
}

// ---------------------------------------------------------------------
// Cotation (API v1, XML)
// ---------------------------------------------------------------------

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .trim();

/** Contenu du premier élément <name> (sans attributs imbriqués complexes). */
function tag(xml: string, name: string) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
}

type RawOffer = { carrier: string; carrierName: string; service: string; serviceName: string; ttc: number; collection: string; delivery: string; deliveryDate: string | null };

export function parseQuote(xml: string): RawOffer[] {
  if (/<error[\s>]/.test(xml.slice(0, 300))) throw new BoxtalError(`Cotation refusée : ${decode(tag(xml, 'message')) || decode(tag(xml, 'code'))}`);
  const offers: RawOffer[] = [];
  for (const m of xml.matchAll(/<offer>([\s\S]*?)<\/offer>/g)) {
    const o = m[1];
    const operator = tag(o, 'operator');
    const service = tag(o, 'service');
    const price = tag(o, 'price');
    offers.push({
      carrier: decode(tag(operator, 'code')),
      carrierName: decode(tag(operator, 'label')),
      service: decode(tag(service, 'code')),
      serviceName: decode(tag(service, 'label')),
      ttc: Number(decode(tag(price, 'tax-inclusive')).replace(',', '.')),
      collection: decode(tag(tag(tag(o, 'collection'), 'type'), 'code')),
      delivery: decode(tag(tag(tag(o, 'delivery'), 'type'), 'code')),
      deliveryDate: decode(tag(tag(o, 'delivery'), 'date')) || null,
    });
  }
  return offers.filter((o) => o.carrier && o.service && Number.isFinite(o.ttc) && o.ttc > 0);
}

/** Transporteurs proposés : dépôt en relais ou en bureau de poste par le vendeur (pas d'enlèvement à la ferme). */
const CARRIERS = ['MONR', 'CHRP', 'POFR', 'SOGP'];
const CARRIER_NAMES: Record<string, string> = { MONR: 'Mondial Relay', CHRP: 'Chronopost', POFR: 'Colissimo', SOGP: 'Relais Colis' };
/** Services express (livraison avant 10 h, 13 h…) : trop chers pour le matériel d'occasion. */
const EXCLUDED = /^Chrono(10|13|18)|Express|Expert/i;

/** Meilleures offres : la moins chère en point relais pour chaque transporteur, la moins chère à domicile, et Colissimo à domicile. */
export function pickOffers(raw: RawOffer[]): ShippingOption[] {
  const ok = raw.filter((o) => CARRIERS.includes(o.carrier) && ['DROPOFF_POINT', 'POST_OFFICE'].includes(o.collection) && ['PICKUP_POINT', 'HOME'].includes(o.delivery) && !EXCLUDED.test(o.service));
  const best = new Map<string, RawOffer>();
  const keep = (key: string, o: RawOffer) => {
    const cur = best.get(key);
    if (!cur || o.ttc < cur.ttc) best.set(key, o);
  };
  for (const o of ok) {
    if (o.delivery === 'PICKUP_POINT') keep(`PP-${o.carrier}`, o);
    else {
      keep('HOME', o);
      if (o.carrier === 'POFR') keep('HOME-POFR', o);
    }
  }
  const seen = new Set<string>();
  return [...best.values()]
    .filter((o) => {
      const code = `${o.carrier}-${o.service}`;
      if (seen.has(code)) return false;
      seen.add(code);
      return true;
    })
    .map((o) => ({
      code: `${o.carrier}-${o.service}`,
      carrier: CARRIER_NAMES[o.carrier] ?? o.carrierName,
      service: o.serviceName,
      delivery: o.delivery as ShippingOption['delivery'],
      collection: o.collection as ShippingOption['collection'],
      price_cents: Math.ceil(o.ttc * 100),
      eta: o.deliveryDate,
    }))
    .sort((a, b) => a.price_cents - b.price_cents)
    .slice(0, 6);
}

export type QuoteInput = { fromZip: string; fromCity: string; toZip: string; toCity: string; weightKg: number; size: ParcelSize; category: ListingCategory; valueCents: number };

async function quoteUncached(q: QuoteInput): Promise<ShippingOption[]> {
  const [l, w, h] = PARCEL_SIZES[q.size].dims;
  const params = new URLSearchParams({
    'colis_1.poids': String(Math.max(0.1, Math.round(q.weightKg * 1000) / 1000)),
    'colis_1.longueur': String(l),
    'colis_1.largeur': String(w),
    'colis_1.hauteur': String(h),
    code_contenu: contentCode(q.category),
    'expediteur.pays': 'FR',
    'expediteur.code_postal': q.fromZip,
    'expediteur.ville': q.fromCity,
    'expediteur.type': 'particulier',
    'destinataire.pays': 'FR',
    'destinataire.code_postal': q.toZip,
    'destinataire.ville': q.toCity,
    'destinataire.type': 'particulier',
    'colis.valeur': (q.valueCents / 100).toFixed(2),
  });
  const res = await call(`${V1()}/cotation?${params}`, { accept: 'application/xml', timeout: 20_000 });
  const xml = await res.text();
  if (!res.ok && !xml.includes('<offer>')) throw new BoxtalError(`Cotation refusée (HTTP ${res.status}) : ${decode(tag(xml, 'message'))}`, res.status);
  return pickOffers(parseQuote(xml));
}

/** Offres pour un colis (mises en cache 6 heures : les tarifs bougent peu). */
export async function quoteShipping(q: QuoteInput) {
  const key = [q.fromZip, q.fromCity.toLowerCase(), q.toZip, q.toCity.toLowerCase(), q.weightKg, q.size, q.category, Math.round(q.valueCents / 1000)].join('|');
  return unstable_cache(() => quoteUncached(q), ['boxtal-cotation', key], { revalidate: 6 * 3600, tags: ['boxtal-cotation'] })();
}

// ---------------------------------------------------------------------
// Points relais (API v3)
// ---------------------------------------------------------------------

type RawPoint = {
  distanceFromSearchLocation?: number;
  parcelPoint?: { code?: string; name?: string; compatibleNetworks?: string[]; location?: { street?: string; city?: string; postalCode?: string } };
};

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m) => m.toUpperCase());

function toPoint(p: RawPoint): ParcelPointOption | null {
  const pp = p.parcelPoint ?? (p as RawPoint['parcelPoint']);
  if (!pp?.code) return null;
  return {
    code: String(pp.code),
    name: title(clean(pp.name)),
    street: title(clean(pp.location?.street)),
    zip: clean(pp.location?.postalCode),
    city: title(clean(pp.location?.city)),
    distance: typeof p.distanceFromSearchLocation === 'number' ? p.distanceFromSearchLocation : null,
    locker: (pp.compatibleNetworks ?? []).some((n) => n.includes('LOCKERS_ONLY')),
  };
}

/** Points où l'acheteur peut retirer le colis (ARRIVAL) ou où le vendeur peut le déposer (DEPARTURE), du plus proche au plus loin. */
export async function parcelPoints(offerCode: string, zip: string, city: string, street: string | null, operation: 'ARRIVAL' | 'DEPARTURE' = 'ARRIVAL') {
  const params = new URLSearchParams({ shippingOfferCode: offerCode, operationType: operation, postalCode: zip, city, countryIsoCode: 'FR' });
  if (street) params.set('street', street);
  const raw = await v3<RawPoint[]>('GET', `/v3.2/parcel-point-by-shipping-offer?${params}`);
  return (Array.isArray(raw) ? raw : []).map(toPoint).filter((p): p is ParcelPointOption => Boolean(p));
}

// ---------------------------------------------------------------------
// Bordereaux (API v3)
// ---------------------------------------------------------------------

export type BoxtalAddress = { firstName: string; lastName: string; email: string; phone: string; street: string; zip: string; city: string };

function address(a: BoxtalAddress) {
  return {
    type: 'RESIDENTIAL',
    contact: { firstName: a.firstName, lastName: a.lastName, email: a.email, phone: phoneE164(a.phone) },
    location: { street: a.street, postalCode: a.zip, city: a.city, countryIsoCode: 'FR' },
  };
}

/** 06 12 34 56 78 → +33612345678 (format attendu par les transporteurs). */
export function phoneE164(phone: string) {
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0033')) return '+' + d.slice(2);
  if (d.startsWith('0') && d.length === 10) return '+33' + d.slice(1);
  return d;
}

export function splitName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? 'Client', lastName: parts[0] ?? 'Client' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

export type ShipmentRequest = {
  offerCode: string;
  from: BoxtalAddress;
  to: BoxtalAddress;
  weightKg: number;
  size: ParcelSize;
  category: ListingCategory;
  valueCents: number;
  description: string;
  pickupPointCode: string | null;
  dropoffPointCode: string | null;
  externalId: string;
};

export type ShipmentCreated = { id: string; status: string; priceExclTax: number | null; estimatedDeliveryDate: string | null };

export async function createShipment(r: ShipmentRequest): Promise<ShipmentCreated> {
  const [l, w, h] = PARCEL_SIZES[r.size].dims;
  const shipment: Record<string, unknown> = {
    fromAddress: address(r.from),
    toAddress: address(r.to),
    packages: [
      {
        type: 'PARCEL',
        weight: Math.max(0.1, r.weightKg),
        length: l,
        width: w,
        height: h,
        value: { value: Math.round(r.valueCents) / 100, currency: 'EUR' },
        content: { id: `content:v1:${contentCode(r.category)}`, description: r.description.slice(0, 100) },
      },
    ],
    externalId: r.externalId,
  };
  if (r.pickupPointCode) shipment.pickupPointCode = r.pickupPointCode;
  if (r.dropoffPointCode) shipment.dropoffPointCode = r.dropoffPointCode;
  const c = await v3<{ id?: string; status?: string; deliveryPriceExclTax?: { value?: number }; estimatedDeliveryDate?: string }>('POST', '/v3.1/shipping-order', {
    shippingOfferCode: r.offerCode,
    labelType: 'PDF_A4',
    insured: false,
    shipment,
  });
  if (!c?.id) throw new BoxtalError('Boxtal n’a pas renvoyé de numéro d’expédition.');
  return { id: String(c.id), status: String(c.status ?? 'PENDING'), priceExclTax: c.deliveryPriceExclTax?.value ?? null, estimatedDeliveryDate: c.estimatedDeliveryDate ?? null };
}

/** Lien (temporaire) du bordereau PDF ; null tant qu'il n'est pas prêt (quelques secondes après la commande). */
export async function labelUrl(shipmentId: string) {
  try {
    const docs = await v3<{ type?: string; url?: string }[]>('GET', `/v3.1/shipping-order/${encodeURIComponent(shipmentId)}/shipping-document`);
    const list = Array.isArray(docs) ? docs : [];
    return (list.find((d) => d.type === 'LABEL') ?? list[0])?.url ?? null;
  } catch (err) {
    if (err instanceof BoxtalError && err.codes.some((c) => c === 'NoShippingDocumentException' || c === 'UnexpectedException')) return null;
    throw err;
  }
}

export type Tracking = { status: string | null; message: string; at: string | null; final: boolean; number: string; url: string; handedOver: boolean; delivered: boolean };

const HANDED_OVER = ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_ATTEMPT', 'REACHED_DELIVERY_PICKUP_POINT', 'DELIVERED', 'RETURNED', 'EXCEPTION'];

type RawTracking = { status?: string; message?: string; trackingDateTime?: string; isFinal?: boolean; trackingNumber?: string; packageTrackingUrl?: string; history?: { status?: string }[] };

export function toTracking(t: RawTracking): Tracking {
  const statuses = [t.status, ...(t.history ?? []).map((h) => h.status)].filter(Boolean) as string[];
  return {
    status: t.status ?? null,
    message: clean(t.message),
    at: t.trackingDateTime ?? null,
    final: Boolean(t.isFinal),
    number: clean(t.trackingNumber),
    url: clean(t.packageTrackingUrl),
    handedOver: statuses.some((s) => HANDED_OVER.includes(s)),
    delivered: statuses.includes('DELIVERED'),
  };
}

/** Suivi du colis ; null tant que le transporteur n'a rien transmis. */
export async function tracking(shipmentId: string): Promise<Tracking | null> {
  try {
    const list = await v3<RawTracking[]>('GET', `/v3.1/shipping-order/${encodeURIComponent(shipmentId)}/tracking`);
    const first = Array.isArray(list) ? list[0] : null;
    return first ? toTracking(first) : null;
  } catch (err) {
    if (err instanceof BoxtalError && err.codes.some((c) => c === 'NoPackageTrackingFoundException' || c === 'UnexpectedException')) return null;
    throw err;
  }
}

/** Annule un bordereau pas encore déposé (Boxtal le rembourse). */
export async function cancelShipment(shipmentId: string) {
  await v3('DELETE', `/v3.1/shipping-order/${encodeURIComponent(shipmentId)}`);
}

// ---------------------------------------------------------------------
// Notifications (webhooks)
// ---------------------------------------------------------------------

/** Secret des notifications, dérivé de la clé secrète Supabase : jamais stocké. */
export function webhookSecret() {
  return createHmac('sha256', env.supabaseSecretKey()).update('boxtal-webhook').digest('hex');
}

export function signatureValid(raw: string, signature: string | null) {
  let sig = (signature ?? '').trim();
  if (sig.toLowerCase().startsWith('sha256=')) sig = sig.slice(7);
  if (!sig) return false;
  const digest = createHmac('sha256', webhookSecret()).update(raw).digest();
  const candidates = [Buffer.from(digest.toString('hex')), Buffer.from(digest.toString('base64'))];
  const given = Buffer.from(/^[0-9a-f]+$/i.test(sig) ? sig.toLowerCase() : sig);
  return candidates.some((c) => c.length === given.length && timingSafeEqual(c, given));
}

export type Subscription = { id: string; eventType: string; callbackUrl: string };

export async function subscriptions() {
  const list = await v3<Subscription[]>('GET', '/v3.1/subscription');
  return Array.isArray(list) ? list : [];
}

export async function subscribe(eventType: 'TRACKING_CHANGED' | 'DOCUMENT_CREATED', callbackUrl: string) {
  return v3<Subscription>('POST', '/v3.1/subscription', { eventType, callbackUrl, webhookSecret: webhookSecret() });
}

export async function unsubscribe(id: string) {
  await v3('DELETE', `/v3.1/subscription/${encodeURIComponent(id)}`);
}

/** Catégories de contenu (diagnostic). */
export async function contentCategories() {
  const list = await v3<{ id?: string; label?: string }[]>('GET', '/v3.1/content-category');
  return Array.isArray(list) ? list : [];
}
