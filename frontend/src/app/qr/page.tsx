'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_name: string | null;
};

type Session = {
  table_id: string;
  table_number: string;
  cafe_name: string;
  pay_at_counter: true;
};

function apiUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function GuestQrOrderPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t') || searchParams.get('token') || '';
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError('Missing table QR token. Ask staff for a valid QR code.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, menuRes] = await Promise.all([
        fetch(apiUrl(`/api/public/qr/session?token=${encodeURIComponent(token)}`)),
        fetch(apiUrl(`/api/public/qr/menu?token=${encodeURIComponent(token)}`)),
      ]);
      if (!sessionRes.ok) {
        const body = await sessionRes.json().catch(() => ({}));
        throw new Error(body.error || 'Invalid or revoked QR code');
      }
      if (!menuRes.ok) {
        const body = await menuRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load menu');
      }
      const sessionJson = (await sessionRes.json()) as Session;
      const menuJson = (await menuRes.json()) as { items: MenuItem[] };
      setSession(sessionJson);
      setItems(menuJson.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!placedOrderId || !token) return;
    const tick = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/public/qr/orders/${placedOrderId}?token=${encodeURIComponent(token)}`),
        );
        if (!res.ok) return;
        const body = (await res.json()) as { status: string };
        setOrderStatus(body.status);
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [placedOrderId, token]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([productId, quantity]) => {
          const product = items.find((i) => i.id === productId);
          return { product, quantity };
        })
        .filter((l) => l.product),
    [cart, items],
  );

  const cartTotal = cartLines.reduce(
    (sum, line) => sum + (line.product?.price || 0) * line.quantity,
    0,
  );

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const remove = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      const q = (next[id] || 0) - 1;
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });

  const placeOrder = async () => {
    if (cartLines.length === 0 || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/public/qr/orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items: cartLines.map((l) => ({
            product_id: l.product!.id,
            quantity: l.quantity,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not place order');
      setPlacedOrderId(String(body.order?.id));
      setOrderStatus(body.order?.status || 'pending');
      setCart({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-flo-bg text-flo-text flex items-center justify-center p-6">
        <p className="text-flo-text-secondary">Loading menu…</p>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="min-h-screen bg-flo-bg text-flo-text flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">QR ordering unavailable</h1>
          <p className="text-flo-text-secondary">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-flo-bg text-flo-text">
      <header className="sticky top-0 z-10 border-b border-flo-border bg-flo-surface/95 backdrop-blur px-4 py-3">
        <p className="text-caption text-flo-text-muted uppercase tracking-wide">Guest order</p>
        <h1 className="text-lg font-semibold">{session?.cafe_name}</h1>
        <p className="text-small text-flo-text-secondary">
          Table {session?.table_number} · Pay at counter
        </p>
      </header>

      {placedOrderId && (
        <div className="mx-4 mt-4 rounded-flo-md border border-flo-brand-200 bg-flo-brand-50 px-4 py-3">
          <p className="font-medium text-flo-brand-800">Order #{placedOrderId} placed</p>
          <p className="text-small text-flo-brand-700">
            Status: {orderStatus || 'pending'}. Please pay at the counter — online payment is not
            available.
          </p>
        </div>
      )}

      {error && (
        <p className="mx-4 mt-3 text-small text-red-600" role="alert">
          {error}
        </p>
      )}

      <section className="px-4 py-4 space-y-3 pb-36">
        {items.length === 0 ? (
          <p className="text-flo-text-secondary">No items available right now.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-flo-md border border-flo-border bg-flo-surface p-3"
            >
              <div className="min-w-0">
                {item.category_name && (
                  <p className="text-caption text-flo-text-muted">{item.category_name}</p>
                )}
                <p className="font-medium truncate">{item.name}</p>
                {item.description && (
                  <p className="text-caption text-flo-text-secondary line-clamp-2">
                    {item.description}
                  </p>
                )}
                <p className="text-small mt-1">{Number(item.price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-flo-md border border-flo-border"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  −
                </button>
                <span className="w-6 text-center">{cart[item.id] || 0}</span>
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-flo-md bg-flo-brand-600 text-white"
                  onClick={() => add(item.id)}
                  aria-label={`Add ${item.name}`}
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="fixed bottom-0 inset-x-0 border-t border-flo-border bg-flo-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
          <div>
            <p className="text-small text-flo-text-secondary">{cartLines.length} item(s)</p>
            <p className="font-semibold">{cartTotal.toFixed(2)}</p>
          </div>
          <button
            type="button"
            disabled={submitting || cartLines.length === 0}
            onClick={() => void placeOrder()}
            className="min-h-11 px-5 rounded-flo-md bg-flo-brand-600 text-white font-medium disabled:opacity-50"
          >
            {submitting ? 'Placing…' : 'Place order'}
          </button>
        </div>
      </footer>
    </main>
  );
}

export default function GuestQrOrderPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-flo-bg text-flo-text flex items-center justify-center p-6">
          <p className="text-flo-text-secondary">Loading menu…</p>
        </main>
      }
    >
      <GuestQrOrderPageInner />
    </Suspense>
  );
}
