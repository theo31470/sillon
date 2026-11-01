import 'server-only';
import { unstable_cache } from 'next/cache';

/**
 * Printful (impression à la demande) : catalogue de la boutique, frais de
 * port, transmission et suivi des commandes. API v1, la seule qui expose
 * les « produits synchronisés » créés dans le tableau de bord Printful.
 *
 * Variables : PRINTFUL_API_KEY (jeton privé, à créer sur developers.printful.com,
 * en « Sensitive » dans Vercel) et, si le jeton couvre plusieurs boutiques,
 * PRINTFUL_STORE_ID. Sans jeton, la boutique reste fermée.
 */

const API = () => process.env.PRINTFUL_API_URL || 'https://api.printful.com';
export const SHOP_CACHE_TAG = 'boutique';

export const printfulConfigured = () => Boolean(process.env.PRINTFUL_API_KEY);

export class PrintfulError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const key = process.env.PRINTFUL_API_KEY;
  if (!key) throw new PrintfulError('Boutique non configurée (PRINTFUL_API_KEY absente)', 503);
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'TracteursEtCo/1.0' };
  if (process.env.PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API()}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout((init.method ?? 'GET') === 'GET' ? 10_000 : 25_000),
        cache: 'no-store',
      });
    } catch (err) {
      if (attempt < 1) {
        await pause(800);
        continue;
      }
      throw new PrintfulError(`Printful injoignable : ${err instanceof Error ? err.message : String(err)}`, 503);
    }
    // Trop de requêtes ou panne passagère : on patiente un peu (lectures seulement, pour ne rien doubler).
    if ((res.status === 429 || res.status >= 500) && attempt < 2 && (init.method ?? 'GET') === 'GET') {
      await pause(1500 * (attempt + 1));
      continue;
    }
    const json = (await res.json().catch(() => null)) as { code?: number; result?: unknown; error?: { message?: string } } | null;
    if (!res.ok || !json || (json.code && json.code >= 400)) {
      const msg = json?.error?.message || (typeof json?.result === 'string' ? json.result : '') || res.statusText;
      throw new PrintfulError(`Printful ${res.status} : ${msg}`.slice(0, 400), res.status);
    }
    return json.result as T;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const toCents = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

// ---------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------

type PfSyncProduct = { id: number; external_id: string | null; name: string; variants: number; synced: number; thumbnail_url: string | null; is_ignored: boolean };
type PfFile = { type: string; preview_url: string | null; thumbnail_url: string | null; visible?: boolean };
type PfSyncVariant = {
  id: number;
  name: string;
  synced: boolean;
  variant_id: number;
  retail_price: string | null;
  currency: string;
  is_ignored: boolean;
  size?: string | null;
  color?: string | null;
  availability_status?: string | null;
  product: { variant_id: number; product_id: number; image: string | null; name: string };
  files: PfFile[];
};

export type ShopVariant = {
  /** Identifiant de la variante synchronisée (c'est lui qu'on commande). */
  id: number;
  /** Variante du catalogue Printful (frais de port). */
  catalogVariantId: number;
  name: string;
  color: string | null;
  size: string | null;
  priceCents: number;
  image: string | null;
  available: boolean;
};

export type ShopProduct = {
  id: number;
  name: string;
  image: string | null;
  /** Prix le plus bas parmi les variantes disponibles. */
  fromCents: number;
  colors: string[];
  sizes: string[];
  variants: ShopVariant[];
};

// Ordre habituel des tailles, pour les afficher de la plus petite à la plus grande.
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL', '6XL'];
const sizeRank = (s: string | null) => {
  const i = SIZE_ORDER.indexOf((s ?? '').toUpperCase());
  return i === -1 ? 100 : i;
};

/** Taille et couleur : champs dédiés, sinon déduites du nom « Produit / Couleur / Taille ». */
function variantTraits(v: PfSyncVariant) {
  const parts = v.name.split(' / ').slice(1).map((s) => s.trim());
  const size = v.size?.trim() || parts.find((p) => sizeRank(p) < 100) || null;
  const color = v.color?.trim() || parts.find((p) => p !== size) || null;
  return { size, color };
}

function toShopProduct(p: PfSyncProduct, variants: PfSyncVariant[]): ShopProduct | null {
  const list: ShopVariant[] = [];
  for (const v of variants) {
    const price = toCents(v.retail_price);
    if (v.is_ignored || !v.synced || !price || price <= 0) continue;
    const { size, color } = variantTraits(v);
    const preview = v.files.find((f) => f.type === 'preview' && f.preview_url)?.preview_url ?? null;
    list.push({
      id: v.id,
      catalogVariantId: v.variant_id || v.product.variant_id,
      name: v.name,
      color,
      size,
      priceCents: price,
      image: preview ?? v.product.image ?? p.thumbnail_url,
      // Article arrêté ou en rupture : affiché, mais pas commandable pour l'instant.
      available: !['discontinued', 'out_of_stock', 'temporary_out_of_stock'].includes(v.availability_status ?? ''),
    });
  }
  if (!list.length) return null;
  list.sort((a, b) => (a.color ?? '').localeCompare(b.color ?? '', 'fr') || sizeRank(a.size) - sizeRank(b.size));
  const avail = list.filter((v) => v.available);
  return {
    id: p.id,
    name: p.name.trim(),
    image: p.thumbnail_url ?? list[0].image,
    fromCents: Math.min(...(avail.length ? avail : list).map((v) => v.priceCents)),
    colors: [...new Set(list.map((v) => v.color).filter(Boolean) as string[])],
    sizes: [...new Set(list.map((v) => v.size).filter(Boolean) as string[])].sort((a, b) => sizeRank(a) - sizeRank(b)),
    variants: list,
  };
}

async function fetchCatalog(): Promise<ShopProduct[]> {
  if (!printfulConfigured()) return [];
  const products: PfSyncProduct[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const page = await call<PfSyncProduct[]>(`/store/products?limit=100&offset=${offset}`);
    products.push(...page);
    if (page.length < 100) break;
  }
  const out: ShopProduct[] = [];
  for (const p of products.filter((x) => !x.is_ignored && x.synced > 0)) {
    const detail = await call<{ sync_product: PfSyncProduct; sync_variants: PfSyncVariant[] }>(`/store/products/${p.id}`);
    const product = toShopProduct(detail.sync_product, detail.sync_variants);
    if (product) out.push(product);
  }
  return out;
}

/** Produits en vente (mis en cache 10 minutes ; l'admin peut forcer l'actualisation). */
const cachedCatalog = unstable_cache(fetchCatalog, ['boutique-catalogue-v1'], { revalidate: 600, tags: [SHOP_CACHE_TAG] });

// Panne de Printful : on n'insiste pas pendant 2 minutes (le menu de l'espace membre ne doit jamais attendre).
let lastFailure: { at: number; message: string } | null = null;
export const forgetCatalogFailure = () => {
  lastFailure = null;
};

export async function getShopCatalog(): Promise<{ products: ShopProduct[]; error: string | null }> {
  if (!printfulConfigured()) return { products: [], error: null };
  if (lastFailure && Date.now() - lastFailure.at < 120_000) return { products: [], error: lastFailure.message };
  try {
    const products = await cachedCatalog();
    lastFailure = null;
    return { products, error: null };
  } catch (err) {
    // Une panne n'est pas mise en cache : on réessaie après la pause.
    console.error('[boutique] catalogue', err);
    lastFailure = { at: Date.now(), message: err instanceof Error ? err.message : String(err) };
    return { products: [], error: lastFailure.message };
  }
}

export async function getShopProduct(id: number) {
  const { products } = await getShopCatalog();
  return products.find((p) => p.id === id) ?? null;
}

/** La boutique est ouverte quand Printful est branché et qu'au moins un produit est en vente. */
export async function shopIsOpen() {
  if (!printfulConfigured()) return false;
  return (await getShopCatalog()).products.length > 0;
}

/** Produit tiré en direct de Printful (au moment de payer, sans cache : prix et disponibilité à jour). */
export async function liveProduct(productId: number) {
  try {
    const r = await call<{ sync_product: PfSyncProduct; sync_variants: PfSyncVariant[] }>(`/store/products/${productId}`);
    return r.sync_product.is_ignored ? null : toShopProduct(r.sync_product, r.sync_variants);
  } catch (err) {
    if (err instanceof PrintfulError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------
// Frais de port (France)
// ---------------------------------------------------------------------

export type ShippingQuote = { method: string; label: string; cents: number; minDays: number | null; maxDays: number | null };

export async function shippingQuote(items: { catalogVariantId: number; quantity: number }[]): Promise<ShippingQuote> {
  const rates = await call<{ id: string; name: string; rate: string; currency: string; minDeliveryDays?: number; maxDeliveryDays?: number }[]>('/shipping/rates', {
    method: 'POST',
    body: {
      recipient: { country_code: 'FR' },
      items: items.map((i) => ({ variant_id: String(i.catalogVariantId), quantity: i.quantity })),
      currency: 'EUR',
      locale: 'fr_FR',
    },
  });
  const eur = rates.filter((r) => r.currency === 'EUR' && toCents(r.rate) !== null);
  const pick = eur.find((r) => r.id === 'STANDARD') ?? eur.sort((a, b) => (toCents(a.rate) ?? 0) - (toCents(b.rate) ?? 0))[0];
  if (!pick) throw new PrintfulError('Aucun tarif de livraison pour la France', 422);
  return { method: pick.id, label: 'Livraison standard', cents: toCents(pick.rate)!, minDays: pick.minDeliveryDays ?? null, maxDays: pick.maxDeliveryDays ?? null };
}

// ---------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------

/** Référence de la commande chez Printful (32 caractères au plus). */
export const externalIdOf = (orderId: string) => `tc${orderId.replace(/-/g, '').slice(0, 24)}`;

export type PfShipment = { id: number; carrier: string; service: string; tracking_number: string; tracking_url: string; ship_date?: string; shipped_at?: number };
export type PfOrder = { id: number; external_id: string; status: string; shipments: PfShipment[] };

export async function submitOrder(params: {
  orderId: string;
  shippingMethod: string;
  recipient: { name: string; address1: string; address2?: string | null; city: string; zip: string; country_code: string; email: string; phone?: string | null };
  items: { sync_variant_id: number; quantity: number; unit_cents: number }[];
  costs: { subtotal: number; discount: number; shipping: number; total: number };
}): Promise<PfOrder> {
  const money = (c: number) => (c / 100).toFixed(2);
  return call<PfOrder>('/orders?confirm=true', {
    method: 'POST',
    body: {
      external_id: externalIdOf(params.orderId),
      shipping: params.shippingMethod,
      recipient: params.recipient,
      items: params.items.map((i) => ({ sync_variant_id: i.sync_variant_id, quantity: i.quantity, retail_price: money(i.unit_cents) })),
      retail_costs: { currency: 'EUR', subtotal: money(params.costs.subtotal), discount: money(params.costs.discount), shipping: money(params.costs.shipping), total: money(params.costs.total) },
    },
  });
}

/** Commande Printful d'après notre identifiant (null si Printful ne la connaît pas). */
export async function fetchOrder(orderId: string): Promise<PfOrder | null> {
  try {
    return await call<PfOrder>(`/orders/@${externalIdOf(orderId)}`);
  } catch (err) {
    if (err instanceof PrintfulError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------
// Notifications Printful (expédition, échec, annulation)
// ---------------------------------------------------------------------

export const WEBHOOK_TYPES = ['package_shipped', 'package_returned', 'order_failed', 'order_canceled', 'order_put_hold', 'order_remove_hold'];

export async function webhookConfig() {
  return call<{ url: string | null; types: string[] }>('/webhooks');
}

export async function registerWebhook(url: string) {
  return call<{ url: string; types: string[] }>('/webhooks', { method: 'POST', body: { url, types: WEBHOOK_TYPES } });
}
