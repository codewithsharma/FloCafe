'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';
import PaymentModal from '@/components/pos/PaymentModal';
import { shareBillViaWhatsApp, sendBillViaFlo } from '@/lib/whatsapp-share';
import { useConfirm } from '@/hooks/use-confirm';
import type { Table, Product, Customer } from '@/lib/types';
import type { Order, Bill } from '@/lib/types';
import { getCurrencySymbol, getCountryByCode } from '@/lib/countries';
import { parseDbTimestamp, cn } from '@/lib/utils';
import { usePrinterStore } from '@/hooks/usePrinter';
import { showPrintWarningsToast } from '@/lib/printer/warnings-toast';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useHeldOrdersStore } from '@/store/held-orders';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/cart';
import { usePosSettingsStore } from '@/store/pos-settings';
import { useI18n } from '@/hooks/useI18n';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useWhatsAppReady } from '@/hooks/useWhatsAppReady';
import { PageHeader, LoadingState, EmptyState } from '@/components/flo';
import { isFeatureAvailable, isModuleEnabled } from '@/lib/modules';
import { usePlatformComposition } from '@/hooks/usePlatformComposition';
import { hasCollectibleOutstanding } from '@/lib/bill-collectible';
import {
  OrdersFilterBar,
  OrderCard,
  HeldOrderCard,
  PrintConfirmDialog,
  CancelOrderDialog,
  VoidItemDialog,
  RefundDialog,
  ExchangeDialog,
  DiscountDialog,
  AddItemsDialog,
  type OrdersFilters,
  type CancelOrderState,
  type VoidItemState,
  type RefundDialogState,
  type ExchangeDialogState,
  type DiscountState,
  type SelectedAddItem,
} from '@/components/orders';
import {
  createRefundIdempotencyKey,
  extractRefundErrorMessage,
  postBillRefund,
  postRefundRestock,
} from '@/lib/refunds';
import { printLatestRefundReceiptForBill, printRefundReceipt } from '@/lib/refund-receipt-print';
import { createExchangeAttemptId } from '@exchange/idempotency';
import { runExchange } from '@/lib/exchange/coordinator';
import { clearExchangeAttempt, loadExchangeAttempt } from '@/lib/exchange/session';
import type { ExchangeAttemptState } from '@/lib/exchange/types';
import { isExchangeTerminal } from '@/lib/exchange/types';

const BLOCKED_RESTOCK_STATUSES = new Set(['voided', 'void_adjustment', 'cancelled']);
const RESTOCK_VERTICALS = new Set(['retail', 'retail-test']);
const EXCHANGE_VERTICALS = RESTOCK_VERTICALS;

type FilterType = 'all' | 'active' | 'unpaid' | 'held';

const tabLabelKey: Record<FilterType, string> = {
  all: 'orders.all',
  active: 'orders.active',
  unpaid: 'orders.unpaidBadge',
  held: 'orders.held',
};

export default function OrdersPage() {
  const { currentTenant, user } = useAuthStore();
  const { data: composition } = usePlatformComposition(!!currentTenant);
  const restockVerticalEnabled = RESTOCK_VERTICALS.has(String(composition?.verticalId ?? ''));
  const exchangeVerticalEnabled = EXCHANGE_VERTICALS.has(String(composition?.verticalId ?? ''));
  const { printBill } = usePrinterStore();
  const heldOrdersStore = useHeldOrdersStore();
  const router = useRouter();
  const cartStore = useCartStore();
  const { setTablesRequired, autoPrintBill, printerUseUnicode } = usePosSettingsStore();
  const { t } = useI18n();
  const { formatTime, formatDateTime } = useFormatDate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewingBillId, setPreviewingBillId] = useState<number | null>(null);
  // Snapshot of "now" for the "Xm ago" timestamps below — Date.now() can't be called directly
  // during render (impure), so it's held in state and refreshed periodically instead.
  const [now, setNow] = useState(() => Date.now());
  const [tabFilter, setTabFilter] = useState<FilterType>('active');
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [kdsEnabled, setKdsEnabled] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();
  const isWhatsAppReady = useWhatsAppReady();

  // Consolidated filter state
  const [filters, setFilters] = useState<OrdersFilters>({
    search: '',
    table: '',
    type: '',
    status: '',
  });

  // Consolidated cancel modal state
  const [cancelModal, setCancelModal] = useState<CancelOrderState | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<number | null>(null);
  const [convertingOrderId, setConvertingOrderId] = useState<number | null>(null);

  // Void (in-progress item) modal state
  const [voidItemModal, setVoidItemModal] = useState<VoidItemState | null>(null);
  const [voidingItem, setVoidingItem] = useState(false);

  // Refund modal state (M6.1)
  const [refundModal, setRefundModal] = useState<RefundDialogState | null>(null);
  const [refunding, setRefunding] = useState(false);

  // Exchange modal state (Phase 4.5)
  const [exchangeModal, setExchangeModal] = useState<ExchangeDialogState | null>(null);
  const [exchangeAttempt, setExchangeAttempt] = useState<ExchangeAttemptState | null>(null);
  const [exchanging, setExchanging] = useState(false);
  const [exchangeProductSearch, setExchangeProductSearch] = useState('');

  // Consolidated discount modal state
  const [discountModal, setDiscountModal] = useState<DiscountState | null>(null);
  const [discountRequiresApproval, setDiscountRequiresApproval] = useState(false);
  const [discountPin, setDiscountPin] = useState('');

  // Print states
  const [generatingBill, setGeneratingBill] = useState<number | null>(null);
  const [printingBillId, setPrintingBillId] = useState<number | null>(null);
  const [printingRefundBillId, setPrintingRefundBillId] = useState<number | null>(null);
  const [sendingWaOrderId, setSendingWaOrderId] = useState<number | null>(null);
  const [confirmPrintBillId, setConfirmPrintBillId] = useState<number | null>(null);

  // Other states
  const [addItemsOrder, setAddItemsOrder] = useState<Order | null>(null);
  const [printHistoryExpanded, setPrintHistoryExpanded] = useState<Record<number, boolean>>({});
  const [printHistory, setPrintHistory] = useState<
    Record<number, { id: number; print_type: string; user_name: string; printed_at: string }[]>
  >({});
  const fetchedBillIdsRef = useRef<Set<number>>(new Set());

  // Add Item modal states
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedAddItem[]>([]);
  const [addingItems, setAddingItems] = useState(false);
  const addItemsAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  // Link Customer states
  const [linkCustomerOrderId, setLinkCustomerOrderId] = useState<number | null>(null);
  const [linkCustomerSearch, setLinkCustomerSearch] = useState('');
  const [linkCustomerResults, setLinkCustomerResults] = useState<Customer[]>([]);
  const [linkingCustomer, setLinkingCustomer] = useState(false);
  const linkSearchRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const currency = getCurrencySymbol(
    currentTenant?.currency || 'INR',
    getCountryByCode(currentTenant?.country ?? 'IN')?.locale,
  );
  const fmt = useFormatCurrency();
  const isOwnerOrManager = currentTenant?.role === 'owner' || currentTenant?.role === 'manager';

  const fetchPrintHistory = async (billId: number) => {
    try {
      const { data } = await api.get(`/bills/${billId}/print-history`);
      setPrintHistory((prev) => ({ ...prev, [billId]: data.prints || [] }));
    } catch {
      // Ignore error
    }
  };

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders', { params: { per_page: 50 } });
      const orders = data.orders || [];
      setOrders(orders);
      // Fetch print history only for bills we haven't fetched yet
      orders.forEach((order: Order) => {
        if (order.bill?.id && !fetchedBillIdsRef.current.has(order.bill.id)) {
          fetchedBillIdsRef.current.add(order.bill.id);
          fetchPrintHistory(order.bill.id);
        }
      });
    } catch {
      toast.error(t('orders.loadOrdersFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api
      .get('/settings/kds_enabled')
      .then((res) => {
        const flagOn = res.data?.setting?.value !== 'false';
        setKdsEnabled(isFeatureAvailable('kds', flagOn));
      })
      .catch(() => setKdsEnabled(isFeatureAvailable('kds', true)));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initPage = async () => {
      let isTablesRequired = true;
      try {
        const { data } = await api.get('/settings/business');
        isTablesRequired = typeof data.tables_required === 'boolean' ? data.tables_required : true;
        setTablesRequired(isTablesRequired);
      } catch {
        // Ignore and fallback to default (true)
      }

      fetchOrders();

      if (isTablesRequired && isModuleEnabled('tables')) {
        heldOrdersStore.fetchHeldOrders();
        api
          .get('/tables')
          .then((res) => setTables(res.data.tables || []))
          .catch(() => {});
      }

      api
        .get('/settings/discount')
        .then((res) => setDiscountRequiresApproval(!!res.data.discount_requires_approval))
        .catch(() => {});
    };

    initPage();

    // 10-second backup polling interval (WebSocket handles real-time updates)
    const interval = setInterval(fetchOrders, 10000);

    // Live WebSocket connection to trigger immediate updates
    let ws: globalThis.WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWS = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/kds`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          const token = localStorage.getItem('token');
          if (token) {
            ws?.send(JSON.stringify({ type: 'auth', token }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === 'order_updated' ||
              data.type === 'orders' ||
              data.type === 'initial_data'
            ) {
              fetchOrders();
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWS, 3000);
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        // WS not supported
      }
    };

    connectWS();

    return () => {
      clearInterval(interval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTablesRequired]);

  const isOrderPaid = (order: Order) => {
    const status = order.bill?.payment_status;
    return status === 'paid' || status === 'partially_refunded' || status === 'refunded';
  };

  const paymentStatusOf = (
    order: Order,
  ): 'paid' | 'partial' | 'unpaid' | 'partially_refunded' | 'refunded' | null => {
    if (order.status === 'cancelled') return null;
    const status = order.bill?.payment_status;
    if (
      status === 'paid' ||
      status === 'partial' ||
      status === 'partially_refunded' ||
      status === 'refunded'
    ) {
      return status;
    }
    return 'unpaid';
  };

  const canRefundOrder = (order: Order): boolean => {
    const status = order.bill?.payment_status;
    return (
      (status === 'paid' || status === 'partially_refunded') && Number(order.bill?.paid_amount) > 0
    );
  };

  const getTimeSince = (dateStr: string) => {
    const minutes = Math.floor((now - parseDbTimestamp(dateStr).getTime()) / 60000);
    if (minutes < 1) return t('common.justNow');
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
  };

  const handleCreateNewOrderForCustomer = async (order: Order) => {
    if (!order.customer) return;

    // Check for active POS cart items to avoid accidental loss of progress
    if (cartStore.items.length > 0) {
      const proceed = await confirm(t('orders.cartClearConfirm'));
      if (!proceed) return;
    }

    cartStore.clearCart();
    cartStore.setCustomer(order.customer);

    const posOrderType =
      order.type === 'dine_in' || order.type === 'takeaway' || order.type === 'delivery'
        ? order.type
        : 'takeaway';
    cartStore.setOrderType(posOrderType);

    if (posOrderType === 'dine_in' && order.table_id) {
      cartStore.setTableId(order.table_id);
    }

    if (posOrderType === 'delivery' && order.customer.address) {
      cartStore.setDeliveryAddress(order.customer.address);
    }

    router.push('/pos');
    toast.success(t('orders.newOrderStarted', { name: order.customer.name }));
  };

  const searchCustomersForLink = (query: string) => {
    clearTimeout(linkSearchRef.current);
    if (query.length < 2) {
      setLinkCustomerResults([]);
      return;
    }
    linkSearchRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/customers-search?q=${encodeURIComponent(query)}`);
        setLinkCustomerResults(Array.isArray(data) ? data : data.customers || []);
      } catch {
        setLinkCustomerResults([]);
      }
    }, 300);
  };

  const handleLinkCustomer = async (orderId: number, customerId: string) => {
    setLinkingCustomer(true);
    try {
      await api.patch(`/orders/${orderId}/customer`, { customer_id: customerId });
      toast.success(t('orders.customerLinked'));
      setLinkCustomerOrderId(null);
      setLinkCustomerSearch('');
      setLinkCustomerResults([]);
      fetchOrders();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || t('orders.linkCustomerFailed'));
    } finally {
      setLinkingCustomer(false);
    }
  };

  // A prepaid order is marked 'completed' the moment its bill is fully paid,
  // which can happen before the kitchen has prepared anything (payment and
  // kitchen fulfillment are independent and can finish in either order) — so
  // a completed order still counts as "active" if the kitchen hasn't served
  // all of its items yet. Only applies when this business uses KDS; without
  // it item status is never updated, so it can't be used as a signal.
  const isOrderActive = (order: Order) => {
    if (order.status === 'cancelled') return false;
    if (order.status === 'completed') {
      return (
        kdsEnabled &&
        (order.items || []).some((item) => !['served', 'cancelled'].includes(item.status))
      );
    }
    return true;
  };

  const filteredOrders = orders.filter((order) => {
    // Tab filter
    if (tabFilter === 'active' && !isOrderActive(order)) return false;
    // An order without a bill has not been paid yet. Bills are deliberately
    // generated only when checkout starts, so filtering on bill existence
    // hid otherwise payable orders from the Unpaid tab.
    if (tabFilter === 'unpaid' && !['unpaid', 'partial'].includes(paymentStatusOf(order) || ''))
      return false;

    // Search by order number
    if (
      filters.search &&
      !order.order_number.toLowerCase().includes(filters.search.toLowerCase())
    ) {
      return false;
    }
    // Filter by table
    if (filters.table && String(order.table_id) !== filters.table) {
      return false;
    }
    // Filter by type
    if (filters.type && order.type !== filters.type) {
      return false;
    }
    // Filter by status
    if (filters.status === 'active' && !isOrderActive(order)) {
      return false;
    }
    if (filters.status === 'completed' && order.status !== 'completed') {
      return false;
    }
    if (filters.status === 'cancelled' && order.status !== 'cancelled') {
      return false;
    }
    return true;
  });

  const handleCheckout = async (orderId: number) => {
    setGeneratingBill(orderId);
    try {
      const { data } = await api.post('/bills/generate', { order_id: orderId });
      setPaymentBill(data.bill);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || t('orders.generateBillFailed'));
    } finally {
      setGeneratingBill(null);
    }
  };

  const handlePaymentComplete = async () => {
    const bill = paymentBill; // capture before clearing state
    setPaymentBill(null);
    fetchOrders();

    if (bill && autoPrintBill) {
      const order = orders.find((o) => o.bill?.id === bill.id);
      if (order) {
        try {
          const { data } = await api.get(`/bills/${bill.id}`);
          const latestBill = data.bill as Bill;
          await printBill(
            { ...latestBill, order },
            {
              business_name: currentTenant?.business_name || t('common.businessNameFallback'),
              currency,
              country: currentTenant?.country || 'IN',
            },
            { isReprint: false },
          );
          await api.post(`/bills/${bill.id}/print`, { print_type: 'receipt' });
        } catch {
          toast.error(t('orders.receiptPrintFailedHint'));
        }
      }
    }
  };

  const handlePrint = async (billId: number) => {
    const order = orders.find((o) => o.bill?.id === billId);
    if (!order?.bill) {
      toast.error(t('orders.billNotFound'));
      return;
    }
    const isReprint = (printHistory[billId]?.length ?? 0) > 0;
    setPrintingBillId(billId);
    try {
      // Actually attempt the print first — only log/report success if the printer accepted the job,
      // otherwise a disconnected printer would silently report "success" (it was only logging before).
      const printWarnings = await printBill(
        { ...order.bill, order },
        {
          business_name: currentTenant?.business_name || t('common.businessNameFallback'),
          currency,
          country: currentTenant?.country || 'IN',
        },
        { isReprint },
      );
      await api.post(`/bills/${billId}/print`, { print_type: isReprint ? 'reprint' : 'receipt' });
      toast.success(isReprint ? t('orders.printReceiptReprint') : t('orders.printReceipt'));
      showPrintWarningsToast(printWarnings);
      fetchPrintHistory(billId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'check printer connection';
      toast.error(`${t('orders.printReceiptFailed')}: ${msg}`);
    } finally {
      setPrintingBillId(null);
      setConfirmPrintBillId(null);
    }
  };

  const handleDownloadPrintPreview = async (billId: number) => {
    setPreviewingBillId(billId);
    try {
      const isReprint = (printHistory[billId]?.length ?? 0) > 0;
      const { data } = await api.post<{
        columns: number;
        printer: { name: string };
        text: string;
      }>('/printers/print-bill', {
        billId,
        useUnicode: printerUseUnicode,
        isReprint,
        preview: true,
      });
      const contents = `Printer: ${data.printer.name}\nColumns: ${data.columns}\n\n${data.text}\n`;
      const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${billId}-${data.columns}cols.txt`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('orders.printPreviewDownloaded'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('orders.printPreviewFailed');
      toast.error(`${t('orders.printPreviewFailed')}: ${message}`);
    } finally {
      setPreviewingBillId(null);
    }
  };

  const deleteItem = async (orderId: number, itemId: number) => {
    if (!isOwnerOrManager) {
      toast.error(t('orders.onlyOwnersRemove'));
      return;
    }
    if (
      !(await confirm(t('orders.removeItemConfirm'), {
        destructive: true,
        confirmLabel: t('common.remove'),
      }))
    )
      return;
    try {
      await api.patch(`/orders/${orderId}/items/${itemId}/cancel`, {
        reason: t('orders.removedByManager'),
      });
      toast.success(t('orders.itemRemoved'));
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.removeItemFailed'));
    }
  };

  const handleVoidItem = async () => {
    if (!voidItemModal) return;
    setVoidingItem(true);
    try {
      await api.patch(`/orders/${voidItemModal.orderId}/items/${voidItemModal.itemId}/cancel`, {
        reason: t('orders.removedByManager'),
        override_pin: voidItemModal.overridePin || undefined,
      });
      toast.success(t('orders.itemVoided'));
      setVoidItemModal(null);
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.voidItemFailed'));
    } finally {
      setVoidingItem(false);
    }
  };

  const handleRefund = async () => {
    if (!refundModal) return;
    setRefunding(true);
    try {
      const amountTrim = refundModal.amount.trim();
      const result = await postBillRefund(
        refundModal.billId,
        {
          ...(amountTrim ? { amount: amountTrim } : {}),
          reason: refundModal.reason.trim(),
          override_pin: refundModal.overridePin,
        },
        { idempotencyKey: createRefundIdempotencyKey() },
      );
      toast.success(t('orders.refundSuccess'));
      const billId = refundModal.billId;
      const refundId = result.refund?.id;
      const wantRestock =
        Boolean(refundModal.restockChecked) &&
        Boolean(refundModal.restockOrderItemId) &&
        restockVerticalEnabled;
      const restockQty = Number(refundModal.restockQuantity);
      const restockOrderItemId = refundModal.restockOrderItemId;
      setRefundModal(null);
      fetchOrders();

      if (wantRestock && refundId && restockOrderItemId) {
        try {
          await postRefundRestock(
            refundId,
            { order_item_id: restockOrderItemId, quantity: restockQty },
            { idempotencyKey: createRefundIdempotencyKey() },
          );
          toast.success(t('orders.restockSuccess'));
        } catch (restockErr: unknown) {
          toast.error(extractRefundErrorMessage(restockErr) || t('orders.restockFailed'));
        }
      }

      // Best-effort print — must never imply refund failure
      if (refundId) {
        setPrintingRefundBillId(billId);
        try {
          const printResult = await printRefundReceipt(refundId, billId);
          if (printResult.printed) {
            toast.success(t('orders.refundReceiptPrinted'));
          } else {
            toast.error(printResult.error || t('orders.refundReceiptPrintFailed'));
          }
        } catch {
          toast.error(t('orders.refundReceiptPrintFailed'));
        } finally {
          setPrintingRefundBillId(null);
        }
      }
    } catch (err: unknown) {
      toast.error(extractRefundErrorMessage(err) || t('orders.refundFailed'));
    } finally {
      setRefunding(false);
    }
  };

  const buildExchangeReturnLines = (order: Order) =>
    (order.items ?? [])
      .filter(
        (item) => !BLOCKED_RESTOCK_STATUSES.has(String(item.status)) && Number(item.quantity) > 0,
      )
      .map((item) => ({
        orderItemId: String(item.id),
        productName: item.product_name,
        lineTotal: Number(item.total),
        lineQuantity: Number(item.quantity),
        returnQuantity: 1,
        status: item.status,
        selected: false,
        restockRequested: false,
      }));

  const openExchangeModal = (order: Order) => {
    if (!order.bill) return;
    const saved = loadExchangeAttempt();
    if (saved && saved.originalBillId === order.bill.id) {
      setExchangeAttempt(saved);
    } else {
      setExchangeAttempt(null);
    }
    setExchangeProductSearch('');
    setExchangeModal({
      billId: order.bill.id,
      orderId: order.id,
      orderNumber: order.order_number,
      customerId: order.customer_id,
      reason: '',
      overridePin: '',
      paymentMethod: 'cash',
      returnLines: buildExchangeReturnLines(order),
      replacementLines: [],
    });
  };

  const buildAttemptFromDialog = (
    dialog: ExchangeDialogState,
    attemptId: string,
    prior: ExchangeAttemptState | null,
  ): ExchangeAttemptState => {
    const selectedReturns = dialog.returnLines.filter((l) => l.selected && l.returnQuantity > 0);
    const hasRestock = selectedReturns.some((l) => l.restockRequested);
    return {
      exchangeAttemptId: attemptId,
      originalBillId: dialog.billId,
      originalOrderId: dialog.orderId,
      refundLeg: prior?.refundLeg ?? 'refund_pending',
      refundId: prior?.refundId,
      refundAmount: prior?.refundAmount,
      replacementLeg: prior?.replacementLeg ?? 'replacement_pending',
      replacementOrderId: prior?.replacementOrderId,
      replacementBillId: prior?.replacementBillId,
      replacementPaymentTotal: prior?.replacementPaymentTotal,
      restockLeg: prior?.restockLeg ?? (hasRestock ? 'restock_pending' : 'restock_skipped'),
      returnLines: selectedReturns.map((line) => ({
        orderItemId: line.orderItemId,
        lineTotal: line.lineTotal,
        lineQuantity: line.lineQuantity,
        returnQuantity: line.returnQuantity,
        status: line.status,
        restockRequested: line.restockRequested,
        restockComplete:
          prior?.returnLines.find((p) => p.orderItemId === line.orderItemId)?.restockComplete ??
          false,
      })),
      replacementLines: dialog.replacementLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      })),
      lastError: prior?.lastError,
    };
  };

  const executeExchange = async (
    dialog: ExchangeDialogState,
    resume: ExchangeAttemptState | null,
  ) => {
    if (!dialog) return;
    setExchanging(true);
    try {
      const attemptId = resume?.exchangeAttemptId ?? createExchangeAttemptId();
      let attempt = buildAttemptFromDialog(dialog, attemptId, resume);
      if (resume) {
        attempt = { ...attempt, lastError: undefined };
      }

      const finalState = await runExchange({
        attemptState: attempt,
        billId: dialog.billId,
        refundReason: dialog.reason.trim(),
        overridePin: dialog.overridePin,
        refundMethod: dialog.paymentMethod,
        paymentMethod: dialog.paymentMethod,
        customerId: dialog.customerId,
        onProgress: setExchangeAttempt,
      });

      setExchangeAttempt(finalState);
      if (isExchangeTerminal(finalState)) {
        toast.success(t('orders.exchangeSuccess'));
        clearExchangeAttempt();
        setExchangeModal(null);
        setExchangeAttempt(null);
        fetchOrders();
      }
    } catch (err: unknown) {
      toast.error(extractRefundErrorMessage(err) || t('orders.exchangeFailed'));
    } finally {
      setExchanging(false);
    }
  };

  const handleExchangeConfirm = () => {
    if (!exchangeModal) return;
    void executeExchange(exchangeModal, exchangeAttempt);
  };

  const handleExchangeRetry = () => {
    if (!exchangeModal || !exchangeAttempt) return;
    void executeExchange(exchangeModal, exchangeAttempt);
  };

  const handlePrintRefundReceipt = async (billId: number) => {
    setPrintingRefundBillId(billId);
    try {
      const printResult = await printLatestRefundReceiptForBill(billId);
      if (printResult.printed) {
        toast.success(t('orders.refundReceiptPrinted'));
      } else {
        toast.error(printResult.error || t('orders.refundReceiptReprintFailed'));
      }
    } catch {
      toast.error(t('orders.refundReceiptReprintFailed'));
    } finally {
      setPrintingRefundBillId(null);
    }
  };

  const restoreItem = async (orderId: number, itemId: number) => {
    if (!isOwnerOrManager) return;
    try {
      await api.patch(`/orders/${orderId}/items/${itemId}/restore`);
      toast.success(t('orders.itemRestored'));
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.restoreItemFailed'));
    }
  };

  const handleWhatsAppShare = (order: Order) => {
    if (!order.bill) {
      toast.error(t('orders.billNotFound'));
      return;
    }
    if (!order.customer?.phone) {
      toast.error(t('orders.customerPhoneMissing'));
      return;
    }

    try {
      shareBillViaWhatsApp(
        order.bill,
        { phone: order.customer.phone, country_code: order.customer.country_code },
        {
          business_name: currentTenant?.business_name || t('common.businessNameFallback'),
          currency,
          country: currentTenant?.country || 'IN',
        },
        { pointsEarned: order.bill.points_earned ?? 0 },
      );
    } catch {
      toast.error(t('orders.whatsappFailed'));
    }
  };

  const handleSendViaFlo = async (order: Order) => {
    if (!order.bill) {
      toast.error(t('orders.billNotFound'));
      return;
    }
    if (!order.customer?.phone) {
      toast.error(t('whatsapp.send.customerPhoneRequired'));
      return;
    }
    setSendingWaOrderId(order.id);
    try {
      await sendBillViaFlo(
        order.bill,
        order.customer.phone,
        {
          business_name: currentTenant?.business_name || t('common.businessNameFallback'),
          currency: currentTenant?.currency || 'INR',
          country: currentTenant?.country || 'IN',
        },
        t,
        { pointsEarned: order.bill.points_earned ?? 0 },
      );
    } finally {
      setSendingWaOrderId(null);
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountModal) return;

    // Check if PIN is required
    if (discountRequiresApproval && discountModal.value > 0 && !discountPin) {
      toast.error(t('orders.managerPinRequired'));
      return;
    }

    try {
      await api.patch(`/orders/${discountModal.order.id}/discount`, {
        discount_type: discountModal.type,
        discount_value: discountModal.value,
        discount_reason: discountModal.reason || undefined,
        override_pin: discountRequiresApproval && discountModal.value > 0 ? discountPin : undefined,
      });
      toast.success(t('orders.discountApplied'));
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.discountFailed'));
    } finally {
      setDiscountModal(null);
      setDiscountPin('');
    }
  };

  const showCheckout = (order: Order) => {
    if (['completed', 'cancelled'].includes(order.status)) return false;
    if (order.bill) return hasCollectibleOutstanding(order.bill);
    return !isOrderPaid(order);
  };

  const handleConvertToTakeaway = async (order: Order) => {
    const tableNote = order.table ? t('orders.freeTableSuffix', { name: order.table.name }) : '';
    if (
      !(await confirm(
        t('orders.convertToTakeawayConfirm', { number: order.order_number, tableNote }),
      ))
    )
      return;
    setConvertingOrderId(order.id);
    try {
      await api.patch(`/orders/${order.id}/convert-to-takeaway`);
      toast.success(t('orders.orderConvertedTakeaway'));
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.convertOrderFailed'));
    } finally {
      setConvertingOrderId(null);
    }
  };

  const openAddItemsModal = (order: Order | null) => {
    setSelectedItems([]);
    setProductSearch('');
    setAddItemsOrder(order);
  };

  useEffect(() => {
    if (!addItemsOrder) return;
    api
      .get('/products', { params: { per_page: 200 } })
      .then(({ data }) => setProducts(data.products || []))
      .catch(() => toast.error(t('orders.menuLoadFailed')));
  }, [addItemsOrder, t]);

  const handleAddItemToSelection = (product: Product) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          special_instructions: '',
        },
      ];
    });
  };

  const handleRemoveFromSelection = (productId: number) => {
    setSelectedItems((prev) => prev.filter((i) => i.product_id !== productId));
  };

  const handleUpdateSelectionQty = (productId: number, quantity: number) => {
    if (quantity < 1) return;
    setSelectedItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity } : i)),
    );
  };

  const handleUpdateSelectionNotes = (productId: number, notes: string) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, special_instructions: notes } : i)),
    );
  };

  const handleSubmitAddItems = async () => {
    if (!addItemsOrder || selectedItems.length === 0) return;
    setAddingItems(true);
    try {
      const items = selectedItems.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        special_instructions: i.special_instructions || undefined,
      }));
      const fingerprint = JSON.stringify({
        user_id: user?.id ?? null,
        order_id: addItemsOrder.id,
        items,
      });
      const attempt =
        addItemsAttemptRef.current?.fingerprint === fingerprint
          ? addItemsAttemptRef.current
          : {
              fingerprint,
              key:
                typeof globalThis.crypto?.randomUUID === 'function'
                  ? globalThis.crypto.randomUUID()
                  : `items-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            };
      addItemsAttemptRef.current = attempt;
      await api.post(
        `/orders/${addItemsOrder.id}/items`,
        {
          items,
        },
        { headers: { 'Idempotency-Key': attempt.key } },
      );
      addItemsAttemptRef.current = null;
      toast.success(t('orders.itemsAdded', { count: selectedItems.length }));
      openAddItemsModal(null);
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.addItemsFailed'));
    } finally {
      setAddingItems(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelModal) return;

    setCancellingOrderId(cancelModal.order.id);
    try {
      await api.patch(`/orders/${cancelModal.order.id}/status`, {
        status: 'cancelled',
        reason: cancelModal.reason || undefined,
        free_table: cancelModal.freeTable,
        override_pin: cancelModal.overridePin || undefined,
      });
      toast.success(t('orders.orderCancelled'));
      fetchOrders();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('orders.cancelOrderFailed'));
    } finally {
      setCancellingOrderId(null);
      setCancelModal(null);
    }
  };

  // Helper to update cancel modal state
  const updateCancelModal = (updates: Partial<Omit<CancelOrderState, 'order'>>) => {
    if (cancelModal) {
      setCancelModal({ ...cancelModal, ...updates });
    }
  };

  // Helper to update discount modal state
  const updateDiscountModal = (updates: Partial<Omit<DiscountState, 'order'>>) => {
    if (discountModal) {
      setDiscountModal({ ...discountModal, ...updates });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title={t('nav.orders')}
        actions={
          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'unpaid', 'held'] as FilterType[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTabFilter(f)}
                className={cn(
                  'min-h-11 px-4 py-1.5 rounded-flo-md text-small font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
                  tabFilter === f
                    ? 'bg-flo-brand-600 text-white'
                    : 'bg-flo-surface text-flo-text-secondary border border-flo-border hover:border-flo-brand-500',
                )}
              >
                {t(tabLabelKey[f])}
              </button>
            ))}
          </div>
        }
      />

      <OrdersFilterBar filters={filters} onChange={setFilters} tables={tables} />

      {tabFilter === 'held' ? (
        loading ? (
          <LoadingState label={t('nav.orders')} className="flex-1" />
        ) : Object.keys(heldOrdersStore.orders).length === 0 ? (
          <EmptyState title={t('orders.heldEmpty')} className="flex-1" />
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 content-start items-start auto-rows-max">
            {Object.values(heldOrdersStore.orders).map((heldOrder) => (
              <HeldOrderCard
                key={heldOrder.tableId}
                heldOrder={heldOrder}
                tableName={
                  tables.find((tbl) => tbl.id === heldOrder.tableId)?.name ||
                  t('common.tableFallback')
                }
                heldAtLabel={formatTime(heldOrder.heldAt)}
                onResume={async () => {
                  const held = await heldOrdersStore.restoreOrder(heldOrder.tableId);
                  if (held) {
                    cartStore.loadItems(
                      held.items,
                      heldOrder.tableId,
                      held.customerId,
                      held.guestCount,
                      held.orderNotes,
                    );
                    cartStore.setOrderType('dine_in');
                    router.push('/pos');
                  } else {
                    toast.error(t('orders.resumeFailed'));
                  }
                }}
                onDelete={async () => {
                  if (await confirm(t('orders.deleteHeldConfirm'), { destructive: true })) {
                    try {
                      await heldOrdersStore.removeHeldOrder(heldOrder.tableId);
                      toast.success(t('orders.heldOrderRemoved'));
                    } catch {
                      toast.error(t('orders.removeHeldOrderFailed'));
                    }
                  }
                }}
              />
            ))}
          </div>
        )
      ) : loading ? (
        <LoadingState label={t('nav.orders')} className="flex-1" />
      ) : filteredOrders.length === 0 ? (
        <EmptyState title={t('orders.empty')} className="flex-1" />
      ) : (
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 content-start items-start auto-rows-max">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              timeSince={getTimeSince(order.created_at)}
              isPaid={isOrderPaid(order)}
              paymentStatus={paymentStatusOf(order)}
              showCheckout={showCheckout(order)}
              isOwnerOrManager={isOwnerOrManager}
              isWhatsAppReady={isWhatsAppReady}
              generatingBill={generatingBill === order.id}
              convertingOrder={convertingOrderId === order.id}
              cancellingOrder={cancellingOrderId === order.id}
              printingBill={printingBillId === order.bill?.id}
              sendingWa={sendingWaOrderId === order.id}
              linkingCustomer={linkingCustomer}
              linkCustomerOpen={linkCustomerOrderId === order.id}
              linkCustomerSearch={linkCustomerSearch}
              linkCustomerResults={linkCustomerResults}
              printHistory={order.bill ? printHistory[order.bill.id] || [] : []}
              printHistoryExpanded={order.bill ? !!printHistoryExpanded[order.bill.id] : false}
              formatDateTime={formatDateTime}
              onCheckout={() => handleCheckout(order.id)}
              onAddItems={() => openAddItemsModal(order)}
              onConvertToTakeaway={() => handleConvertToTakeaway(order)}
              onCancel={() =>
                setCancelModal({ order, reason: '', freeTable: true, overridePin: '' })
              }
              onPrint={() => setConfirmPrintBillId(order.bill!.id)}
              onWhatsApp={() =>
                isWhatsAppReady ? handleSendViaFlo(order) : handleWhatsAppShare(order)
              }
              onNewOrderForCustomer={() => handleCreateNewOrderForCustomer(order)}
              onOpenLinkCustomer={() => setLinkCustomerOrderId(order.id)}
              onCloseLinkCustomer={() => {
                setLinkCustomerOrderId(null);
                setLinkCustomerSearch('');
                setLinkCustomerResults([]);
              }}
              onLinkCustomerSearch={(query) => {
                setLinkCustomerSearch(query);
                searchCustomersForLink(query);
              }}
              onLinkCustomer={(customerId) => handleLinkCustomer(order.id, customerId)}
              onDeleteItem={(itemId) => deleteItem(order.id, itemId)}
              onVoidItem={(itemId, productName) =>
                setVoidItemModal({
                  orderId: order.id,
                  itemId,
                  productName,
                  overridePin: '',
                })
              }
              onRestoreItem={(itemId) => restoreItem(order.id, itemId)}
              onTogglePrintHistory={() => {
                if (!order.bill) return;
                setPrintHistoryExpanded((prev) => ({
                  ...prev,
                  [order.bill!.id]: !prev[order.bill!.id],
                }));
              }}
              canRefund={canRefundOrder(order)}
              refunding={refunding && refundModal?.billId === order.bill?.id}
              canPrintRefund={
                !!order.bill &&
                (paymentStatusOf(order) === 'refunded' ||
                  paymentStatusOf(order) === 'partially_refunded')
              }
              printingRefund={printingRefundBillId === order.bill?.id}
              onPrintRefund={() => order.bill && void handlePrintRefundReceipt(order.bill.id)}
              onRefund={() => {
                if (!order.bill) return;
                const restockLines = (order.items ?? [])
                  .filter(
                    (item) =>
                      !BLOCKED_RESTOCK_STATUSES.has(String(item.status)) &&
                      Number(item.quantity) > 0,
                  )
                  .map((item) => ({
                    orderItemId: String(item.id),
                    productName: item.product_name,
                    maxQuantity: Number(item.quantity),
                  }));
                const first = restockLines[0];
                setRefundModal({
                  billId: order.bill.id,
                  orderNumber: order.order_number,
                  paidAmount: Number(order.bill.paid_amount),
                  overridePin: '',
                  reason: '',
                  amount: '',
                  restockEnabled: restockVerticalEnabled,
                  restockLines,
                  restockChecked: false,
                  restockOrderItemId: first?.orderItemId,
                  restockQuantity: first ? '1' : '',
                });
              }}
              canExchange={exchangeVerticalEnabled && canRefundOrder(order)}
              onExchange={() => openExchangeModal(order)}
              exchanging={exchanging && exchangeModal?.billId === order.bill?.id}
            />
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {paymentBill && (
        <PaymentModal
          bill={paymentBill}
          currency={currency}
          onClose={() => setPaymentBill(null)}
          onPaid={handlePaymentComplete}
          onBillUpdate={(updated) => setPaymentBill(updated)}
        />
      )}

      <PrintConfirmDialog
        open={confirmPrintBillId !== null}
        onOpenChange={(open) => !open && setConfirmPrintBillId(null)}
        isReprint={
          confirmPrintBillId !== null && (printHistory[confirmPrintBillId]?.length ?? 0) > 0
        }
        printing={confirmPrintBillId !== null && printingBillId === confirmPrintBillId}
        previewing={confirmPrintBillId !== null && previewingBillId === confirmPrintBillId}
        onPrint={() => confirmPrintBillId !== null && handlePrint(confirmPrintBillId)}
        onDownloadPreview={() =>
          confirmPrintBillId !== null && handleDownloadPrintPreview(confirmPrintBillId)
        }
      />

      <CancelOrderDialog
        open={cancelModal !== null}
        onOpenChange={(open) => !open && setCancelModal(null)}
        state={cancelModal}
        onChange={updateCancelModal}
        onConfirm={handleCancelOrder}
        cancelling={cancelModal !== null && cancellingOrderId === cancelModal.order.id}
      />

      <VoidItemDialog
        open={voidItemModal !== null}
        onOpenChange={(open) => !open && setVoidItemModal(null)}
        state={voidItemModal}
        onChange={setVoidItemModal}
        onConfirm={handleVoidItem}
        voiding={voidingItem}
      />

      <RefundDialog
        open={refundModal !== null}
        onOpenChange={(open) => !open && setRefundModal(null)}
        state={refundModal}
        onChange={setRefundModal}
        onConfirm={handleRefund}
        refunding={refunding}
      />

      <ExchangeDialog
        open={exchangeModal !== null}
        onOpenChange={(open) => {
          if (!open && !exchanging) {
            setExchangeModal(null);
            if (!exchangeAttempt?.lastError) {
              clearExchangeAttempt();
              setExchangeAttempt(null);
            }
          }
        }}
        state={exchangeModal}
        onChange={setExchangeModal}
        products={products}
        productSearch={exchangeProductSearch}
        onProductSearchChange={setExchangeProductSearch}
        onConfirm={handleExchangeConfirm}
        onRetry={handleExchangeRetry}
        processing={exchanging}
        attemptState={exchangeAttempt}
        fmt={fmt}
      />

      <DiscountDialog
        open={discountModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDiscountModal(null);
            setDiscountPin('');
          }
        }}
        state={discountModal}
        onChange={updateDiscountModal}
        onConfirm={handleApplyDiscount}
        discountRequiresApproval={discountRequiresApproval}
        discountPin={discountPin}
        onDiscountPinChange={setDiscountPin}
        currency={currency}
        fmt={fmt}
      />

      <AddItemsDialog
        open={addItemsOrder !== null}
        onOpenChange={(open) => !open && openAddItemsModal(null)}
        order={addItemsOrder}
        products={products}
        productSearch={productSearch}
        onProductSearchChange={setProductSearch}
        selectedItems={selectedItems}
        onAddProduct={handleAddItemToSelection}
        onRemoveItem={handleRemoveFromSelection}
        onUpdateQty={handleUpdateSelectionQty}
        onUpdateNotes={handleUpdateSelectionNotes}
        onSubmit={handleSubmitAddItems}
        adding={addingItems}
        fmt={fmt}
      />

      {ConfirmDialog}
    </div>
  );
}
