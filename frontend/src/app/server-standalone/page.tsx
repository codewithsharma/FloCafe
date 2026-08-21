'use client';

import axios, { AxiosInstance } from 'axios';
import toast from 'react-hot-toast';
import {
  Bell,
  CheckCircle2,
  ChefHat,
  Circle,
  Flame,
  LogOut,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  UserRound,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type User = { id: string; name: string; email: string; role: string };
type Category = { id: string; name: string };
type Product = {
  id: string;
  category_id: string | null;
  name: string;
  price: number | string;
  is_active: number;
};
type Table = {
  id: string;
  name?: string;
  number?: string;
  status?: string;
  activeOrder?: Order | null;
  current_order?: Order | null;
};
type OrderItem = {
  id: number;
  product_name: string;
  quantity: number;
  status: string;
  special_instructions?: string | null;
};
type Order = {
  id: number;
  order_number: string;
  table_id?: string | null;
  status: string;
  items?: OrderItem[];
  customer?: { id: string; name: string; phone?: string } | null;
};
type DraftLine = { product: Product; quantity: number; note: string };

const TOKEN_KEY = 'flocafe:server-app-token';

function createApi(): AxiosInstance {
  const api = axios.create({ baseURL: window.location.origin, timeout: 10000 });
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) localStorage.removeItem(TOKEN_KEY);
      return Promise.reject(error);
    },
  );
  return api;
}

function itemStatusIcon(status: string) {
  if (status === 'preparing')
    return <Flame size={15} className="text-orange-500" aria-label="Preparing" />;
  if (status === 'ready') return <Bell size={15} className="text-emerald-600" aria-label="Ready" />;
  if (status === 'served')
    return <CheckCircle2 size={15} className="text-blue-600" aria-label="Served" />;
  return <Circle size={15} className="text-gray-400" aria-label="Waiting" />;
}

function money(value: number | string) {
  return Number(value || 0).toFixed(2);
}

function responseMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || fallback;
  }
  return fallback;
}

export default function ServerStandalonePage() {
  const api = useMemo(() => (typeof window !== 'undefined' ? createApi() : null), []);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [disabled, setDisabled] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sending, setSending] = useState(false);
  /** Sticky for in-flight send retries; cleared on success or draft clear. */
  const sendIdempotencyKeyRef = useRef<string | null>(null);

  async function loadAll() {
    if (!api) return;
    const [categoriesRes, productsRes, tablesRes] = await Promise.all([
      api.get('/api/categories', { params: { active: 'true' } }),
      api.get('/api/products', { params: { active: 'true' } }),
      api.get('/api/tables', { params: { active: 'true' } }),
    ]);
    setCategories(categoriesRes.data.categories || []);
    setProducts(productsRes.data.products || []);
    const loadedTables = tablesRes.data.tables || [];
    setTables(loadedTables);
    if (!selectedTableId && loadedTables[0]) setSelectedTableId(loadedTables[0].id);
  }

  async function loadOrder(tableId: string) {
    if (!api || !tableId) return;
    const res = await api.get('/api/orders', {
      params: {
        table_id: tableId,
        type: 'dine_in',
        status: 'pending,preparing,ready',
        per_page: 1,
      },
    });
    const order = res.data.orders?.[0] || null;
    setCurrentOrder(order);
    if (order?.customer) {
      setCustomerName(order.customer.name || '');
      setCustomerPhone(order.customer.phone || '');
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  }

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    api
      .get('/api/server-app/info')
      .then(() => api.get('/api/auth/me'))
      .then((res) => {
        if (!cancelled) setUser(res.data.user);
      })
      .catch((error) => {
        if (error.response?.status === 404) setDisabled(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!user || !api) return;
    let cancelled = false;
    Promise.all([
      api.get('/api/categories', { params: { active: 'true' } }),
      api.get('/api/products', { params: { active: 'true' } }),
      api.get('/api/tables', { params: { active: 'true' } }),
    ])
      .then(([categoriesRes, productsRes, tablesRes]) => {
        if (cancelled) return;
        setCategories(categoriesRes.data.categories || []);
        setProducts(productsRes.data.products || []);
        const loadedTables = tablesRes.data.tables || [];
        setTables(loadedTables);
        if (!selectedTableId && loadedTables[0]) setSelectedTableId(loadedTables[0].id);
      })
      .catch(() => toast.error('Could not load Server App data'));
    return () => {
      cancelled = true;
    };
  }, [api, selectedTableId, user]);

  useEffect(() => {
    if (!selectedTableId || !user || !api) return;
    let cancelled = false;
    api
      .get('/api/orders', {
        params: {
          table_id: selectedTableId,
          type: 'dine_in',
          status: 'pending,preparing,ready',
          per_page: 1,
        },
      })
      .then((res) => {
        if (cancelled) return;
        const order = res.data.orders?.[0] || null;
        setCurrentOrder(order);
        if (order?.customer) {
          setCustomerName(order.customer.name || '');
          setCustomerPhone(order.customer.phone || '');
        } else {
          setCustomerName('');
          setCustomerPhone('');
        }
      })
      .catch(() => {
        if (!cancelled) setCurrentOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, selectedTableId, user]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (!api) return;
    setLoginLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password, remember_me: rememberMe });
      localStorage.setItem(TOKEN_KEY, res.data.access_token);
      setUser(res.data.user);
    } catch (error: unknown) {
      toast.error(responseMessage(error, 'Sign in failed'));
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    try {
      await api?.post('/api/auth/logout');
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  function addProduct(product: Product) {
    setDraft((lines) => {
      const existing = lines.find((line) => line.product.id === product.id && line.note === '');
      if (existing) {
        return lines.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...lines, { product, quantity: 1, note: '' }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setDraft((lines) =>
      lines
        .map((line) =>
          line.product.id === productId ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function ensureCustomer(): Promise<string | null> {
    if (!api) return null;
    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name && !phone) return null;
    if (phone) {
      try {
        const lookup = await api.get('/api/crm/lookup', { params: { phone } });
        if (lookup.data.found && lookup.data.customer?.id) return lookup.data.customer.id;
      } catch {}
    }
    const fallbackName = name || `Guest ${phone.slice(-4)}`;
    const res = await api.post('/api/customers', { name: fallbackName, phone: phone || undefined });
    return res.data.customer?.id || null;
  }

  async function sendDraft() {
    if (!api || !selectedTableId || draft.length === 0) return;
    setSending(true);
    try {
      const customerId = await ensureCustomer();
      const items = draft.map((line) => ({
        product_id: line.product.id,
        quantity: line.quantity,
        special_instructions: line.note.trim() || undefined,
      }));
      // Stable per in-flight send: retries reuse the same key; success clears it.
      if (!sendIdempotencyKeyRef.current) {
        sendIdempotencyKeyRef.current =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `server-app-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      const idempotencyKey = sendIdempotencyKeyRef.current;
      if (currentOrder?.id) {
        await api.post(
          `/api/orders/${currentOrder.id}/items`,
          { items },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        );
      } else {
        await api.post(
          '/api/orders',
          {
            table_id: selectedTableId,
            customer_id: customerId,
            type: 'dine_in',
            items,
          },
          { headers: { 'Idempotency-Key': idempotencyKey } },
        );
      }
      sendIdempotencyKeyRef.current = null;
      setDraft([]);
      await Promise.all([loadAll(), loadOrder(selectedTableId)]);
      toast.success('Order sent');
    } catch (error: unknown) {
      toast.error(responseMessage(error, 'Could not send order'));
    } finally {
      setSending(false);
    }
  }

  const activeTable = tables.find((table) => table.id === selectedTableId) || null;
  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategoryId === 'all' || product.category_id === selectedCategoryId;
    const matchesQuery = !query || product.name.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });
  const draftTotal = draft.reduce(
    (sum, line) => sum + Number(line.product.price || 0) * line.quantity,
    0,
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-flo-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-flo-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-flo-bg px-6 text-center">
        <Smartphone size={44} className="text-flo-text-muted" />
        <h1 className="text-lg font-semibold text-flo-text">Server App is disabled</h1>
        <p className="max-w-sm text-sm text-flo-text-secondary">
          Ask an owner or manager to re-enable Tableside Ordering from Settings.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-flo-bg p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-flo-lg border border-flo-border bg-flo-surface p-6 shadow-sm"
        >
          <div className="mb-6 text-center">
            <UserRound size={42} className="mx-auto mb-3 text-flo-brand-600" />
            <h1 className="text-2xl font-bold text-flo-text">Server App</h1>
            <p className="mt-1 text-sm text-flo-text-secondary">
              Tableside ordering for service staff
            </p>
          </div>
          <div className="space-y-3">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="server@flo.local"
              required
              className="h-11 w-full rounded-flo-md border border-flo-border bg-flo-surface px-3 text-sm text-flo-text focus:border-flo-brand-500 focus:outline-none focus:ring-2 focus:ring-flo-brand-500/20"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              placeholder="Password"
              required
              className="h-11 w-full rounded-flo-md border border-flo-border bg-flo-surface px-3 text-sm text-flo-text focus:border-flo-brand-500 focus:outline-none focus:ring-2 focus:ring-flo-brand-500/20"
            />
            <label className="flex items-center gap-2 text-sm text-flo-text-secondary">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
              />
              Keep me logged in
            </label>
            <button
              disabled={loginLoading}
              className="h-11 w-full rounded-flo-md bg-flo-brand-600 font-semibold text-white disabled:opacity-60"
            >
              {loginLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-flo-bg text-flo-text">
      <header className="sticky top-0 z-20 border-b border-flo-border bg-flo-surface/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-flo-md bg-flo-brand-600 text-white">
            <ChefHat size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">Server App</h1>
            <p className="truncate text-xs text-flo-text-secondary">
              {activeTable ? `Table ${activeTable.name || activeTable.number}` : 'Select a table'}
            </p>
          </div>
          <button
            onClick={() => loadAll().catch(() => toast.error('Refresh failed'))}
            className="rounded-flo-md border border-flo-border p-2 text-flo-text-secondary hover:bg-flo-surface-muted"
          >
            <RefreshCw size={17} />
          </button>
          <button
            onClick={logout}
            className="rounded-flo-md border border-flo-border p-2 text-flo-text-secondary hover:bg-flo-surface-muted"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-3 p-3 lg:grid-cols-[220px_1fr_340px]">
        <section className="rounded-flo-lg border border-flo-border bg-flo-surface p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase text-flo-text-muted">Tables</h2>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            {tables.map((table) => {
              const selected = table.id === selectedTableId;
              const order = table.activeOrder || table.current_order;
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTableId(table.id)}
                  className={`min-h-14 rounded-flo-md border px-2 py-2 text-left ${selected ? 'border-flo-brand-500 bg-flo-brand-50' : 'border-flo-border bg-flo-surface hover:bg-flo-surface-muted'}`}
                >
                  <span className="block truncate text-sm font-semibold">
                    {table.name || table.number}
                  </span>
                  <span className="text-xs text-flo-text-secondary">
                    {order ? 'Open order' : 'Available'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-flo-lg border border-flo-border bg-flo-surface p-3">
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-flo-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search menu"
                className="h-10 w-full rounded-flo-md border border-flo-border bg-flo-surface pl-9 pr-3 text-sm focus:border-flo-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`h-9 shrink-0 rounded-flo-md px-3 text-sm ${selectedCategoryId === 'all' ? 'bg-flo-brand-600 text-white' : 'bg-flo-surface-muted text-flo-text'}`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategoryId(category.id)}
                className={`h-9 shrink-0 rounded-flo-md px-3 text-sm ${selectedCategoryId === category.id ? 'bg-flo-brand-600 text-white' : 'bg-flo-surface-muted text-flo-text'}`}
              >
                {category.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="min-h-24 rounded-flo-md border border-flo-border bg-flo-surface p-3 text-left hover:border-flo-brand-500"
              >
                <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
                <span className="mt-2 block text-sm text-flo-text-secondary">
                  {money(product.price)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-flo-lg border border-flo-border bg-flo-surface p-3 lg:sticky lg:top-16 lg:self-start">
          <h2 className="text-sm font-semibold">Current ticket</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
              className="h-10 rounded-flo-md border border-flo-border bg-flo-surface px-3 text-sm focus:border-flo-brand-500 focus:outline-none"
            />
            <input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="Phone"
              className="h-10 rounded-flo-md border border-flo-border bg-flo-surface px-3 text-sm focus:border-flo-brand-500 focus:outline-none"
            />
          </div>

          {currentOrder?.items && currentOrder.items.length > 0 && (
            <div className="mt-4 border-t border-flo-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-flo-text-muted">Kitchen</p>
              <div className="space-y-2">
                {currentOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    {itemStatusIcon(item.status)}
                    <span className="min-w-0 flex-1 truncate">
                      {item.quantity} x {item.product_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 border-t border-flo-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase text-flo-text-muted">New items</p>
            {draft.length === 0 ? (
              <p className="py-6 text-center text-sm text-flo-text-muted">
                Tap menu items to add them here.
              </p>
            ) : (
              <div className="space-y-3">
                {draft.map((line) => (
                  <div
                    key={line.product.id}
                    className="rounded-flo-md border border-flo-border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {line.product.name}
                      </span>
                      <button
                        onClick={() => changeQty(line.product.id, -1)}
                        className="rounded-flo-md border border-flo-border p-1"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                      <button
                        onClick={() => changeQty(line.product.id, 1)}
                        className="rounded-flo-md border border-flo-border p-1"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <input
                      value={line.note}
                      onChange={(event) =>
                        setDraft((lines) =>
                          lines.map((draftLine) =>
                            draftLine.product.id === line.product.id
                              ? { ...draftLine, note: event.target.value }
                              : draftLine,
                          ),
                        )
                      }
                      placeholder="Item note"
                      className="mt-2 h-9 w-full rounded-flo-md border border-flo-border px-2 text-sm focus:border-flo-brand-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-flo-border pt-3">
            <span className="text-sm text-flo-text-secondary">Draft total</span>
            <span className="text-lg font-bold">{money(draftTotal)}</span>
          </div>
          <button
            onClick={sendDraft}
            disabled={!selectedTableId || draft.length === 0 || sending}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-flo-md bg-flo-brand-600 font-semibold text-white disabled:opacity-50"
          >
            <Send size={17} />
            {sending ? 'Sending...' : currentOrder ? 'Add to order' : 'Send to kitchen'}
          </button>
        </section>
      </main>
    </div>
  );
}
