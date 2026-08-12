'use client';

import OrderHistoryGrid from '@/components/orders/OrderHistoryGrid';
import { Panel } from '@/components/flo';

export default function OrderHistoryDemoPage() {
  return (
    <Panel className="overflow-hidden p-0">
      <OrderHistoryGrid />
    </Panel>
  );
}
