import { Router, Request, Response } from 'express';
import { getDatabase, now, withTxn } from '../db';
import { randomUUID } from 'crypto';
import { requireRole } from '../middleware/security';
import { notifyKdsUpdate } from '../services/kds';
import { cloudSync } from '../services/cloud-sync';
import { logAuditEvent } from '../services/audit-log';
import {
  activeOrderForTable,
  applyTableStatus,
  assignWaiterToTable,
  mergeUnpaidTables,
  splitOrderToTable,
  TableServiceError,
  tableShape,
  transferOrderBetweenTables,
} from '../services/tables';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  tableAssignWaiterBodySchema,
  tableIdParamsSchema,
  tableListQuerySchema,
  tableMergeBodySchema,
  tableMoveOrderBodySchema,
  tableSplitBodySchema,
  tableStatusBodySchema,
  tableUpsertBodySchema,
} from '../validation/tables';
import { routeParam } from '../lib/route-params';

const router = Router();

function actorId(req: Request): string | null {
  return (req as any).user?.userId ?? null;
}

function sendTableError(res: Response, error: any): void {
  if (error instanceof TableServiceError) {
    res.status(error.statusCode ?? 500).json({
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code,
    });
    return;
  }
  const statusCode =
    (error as { status?: number }).status || (error as { statusCode?: number }).statusCode || 500;
  console.error('[API] Table operation failed:', error);
  res.status(statusCode).json({
    error:
      statusCode >= 500
        ? 'Internal server error'
        : error instanceof Error
          ? error.message
          : String(error),
    code: (error as { code?: string }).code,
  });
}

router.get('/', validateQuery(tableListQuerySchema), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM tables WHERE 1=1';
    const params: any[] = [];

    if (req.query.status) {
      query += ' AND status = ?';
      params.push(req.query.status);
    }
    if (req.query.floor) {
      query += ' AND floor = ?';
      params.push(req.query.floor);
    }
    if (req.query.section) {
      query += ' AND section = ?';
      params.push(req.query.section);
    }
    if (req.query.kitchen_station_id) {
      query += ' AND kitchen_station_id = ?';
      params.push(req.query.kitchen_station_id);
    }
    if (req.query.assigned_waiter_id) {
      query += ' AND assigned_waiter_id = ?';
      params.push(req.query.assigned_waiter_id);
    }
    if (req.query.active === 'true' || req.query.active === '1') {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY section, number';

    const rows = db.prepare(query).all(...params);
    const tables = rows.map((t: any) => tableShape(t, activeOrderForTable(db, t.id)));
    res.json({ tables });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const activeOrder = activeOrderForTable(db, req.params.id as string);
    res.json({ table: tableShape(table as any, activeOrder) });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requireRole('owner', 'manager'),
  validateBody(tableUpsertBodySchema),
  (req: Request, res: Response) => {
    try {
      const { number, name, capacity, floor, section, position_x, position_y, kitchen_station_id } =
        req.body;
      const tableNumber = number || name;

      if (!tableNumber) {
        return res.status(400).json({ error: 'Table number is required' });
      }

      const db = getDatabase();
      const existing = db.prepare('SELECT * FROM tables WHERE number = ?').get(tableNumber) as any;
      if (existing) {
        if (existing.is_active === 0) {
          return res.status(400).json({
            error: `Table ${tableNumber} already exists but is deactivated. Please reactivate it from the list.`,
          });
        }
        return res.status(400).json({ error: 'Table number already exists' });
      }

      const tableId = `tbl-${randomUUID().slice(0, 8)}`;
      const nowStr = now();
      withTxn(() => {
        db.prepare(
          `
      INSERT INTO tables (id, number, capacity, floor, section, position_x, position_y, kitchen_station_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        ).run(
          tableId,
          tableNumber,
          capacity || 4,
          floor || null,
          section || null,
          position_x || null,
          position_y || null,
          kitchen_station_id || null,
          nowStr,
          nowStr,
        );
        logAuditEvent({
          actorUserId: actorId(req),
          action: 'table.created',
          entityType: 'table',
          entityId: tableId,
          metadata: { number: tableNumber, capacity: capacity || 4, floor, section },
        });
      });

      const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
      res.status(201).json({ table: tableShape(table as any) });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.put(
  '/:id',
  requireRole('owner', 'manager'),
  validateParams(tableIdParamsSchema),
  validateBody(tableUpsertBodySchema),
  (req: Request, res: Response) => {
    try {
      const { number, name, capacity, floor, section, position_x, position_y, kitchen_station_id } =
        req.body;
      const tableNumber = number || name;
      const db = getDatabase();

      const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
      if (!table) {
        return res.status(404).json({ error: 'Table not found' });
      }

      if (tableNumber) {
        const existing = db
          .prepare('SELECT * FROM tables WHERE number = ? AND id != ?')
          .get(tableNumber, req.params.id);
        if (existing) {
          return res.status(400).json({ error: 'Table number already exists' });
        }
      }

      withTxn(() => {
        db.prepare(
          `
      UPDATE tables SET
        number = COALESCE(?, number),
        capacity = COALESCE(?, capacity),
        floor = COALESCE(?, floor),
        section = COALESCE(?, section),
        position_x = COALESCE(?, position_x),
        position_y = COALESCE(?, position_y),
        kitchen_station_id = COALESCE(?, kitchen_station_id),
        updated_at = ?
      WHERE id = ?
    `,
        ).run(
          tableNumber,
          capacity,
          floor,
          section,
          position_x,
          position_y,
          kitchen_station_id,
          now(),
          req.params.id,
        );
        logAuditEvent({
          actorUserId: actorId(req),
          action: 'table.updated',
          entityType: 'table',
          entityId: routeParam(req.params.id),
          metadata: { number: tableNumber, capacity, floor, section },
        });
      });

      const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
      res.json({
        table: tableShape(updated as any, activeOrderForTable(db, req.params.id as string)),
      });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/:id/deactivate', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id) as any;
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.is_active === 0) {
      return res.status(400).json({ error: 'Already deactivated' });
    }

    const activeOrder = activeOrderForTable(db, req.params.id as string);
    if (activeOrder) {
      return res.status(400).json({ error: 'Cannot deactivate table with active orders' });
    }

    withTxn(() => {
      db.prepare('UPDATE tables SET is_active = 0, updated_at = ? WHERE id = ?').run(
        now(),
        req.params.id,
      );
      logAuditEvent({
        actorUserId: actorId(req),
        action: 'table.deactivated',
        entityType: 'table',
        entityId: routeParam(req.params.id),
      });
    });
    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: tableShape(updated as any) });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reactivate', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id) as any;
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    if (table.is_active === 1) {
      return res.status(400).json({ error: 'Already active' });
    }

    withTxn(() => {
      db.prepare('UPDATE tables SET is_active = 1, updated_at = ? WHERE id = ?').run(
        now(),
        req.params.id,
      );
      logAuditEvent({
        actorUserId: actorId(req),
        action: 'table.reactivated',
        entityType: 'table',
        entityId: routeParam(req.params.id),
      });
    });
    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    res.json({ table: tableShape(updated as any) });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/:id/move-order',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const sourceTableId = req.params.id as string;
      const { target_table_id, order_id } = req.body;

      if (!target_table_id) {
        return res.status(400).json({ error: 'target_table_id is required' });
      }

      const moved = transferOrderBetweenTables({
        sourceTableId,
        targetTableId: target_table_id,
        orderId: order_id,
        actorUserId: actorId(req),
      });

      cloudSync.recordOrderChanged(moved.order.id, 'order.table_moved');
      notifyKdsUpdate();

      res.json({
        order: moved.order,
        sourceTable: moved.sourceTable,
        targetTable: moved.targetTable,
      });
    } catch (error: unknown) {
      sendTableError(res, error);
    }
  },
);

router.post(
  '/:id/merge',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const survivingTableId = req.params.id as string;
      const { source_table_id } = req.body;
      if (!source_table_id) {
        return res.status(400).json({ error: 'source_table_id is required' });
      }

      const result = mergeUnpaidTables({
        survivingTableId,
        sourceTableId: source_table_id,
        actorUserId: actorId(req),
      });

      cloudSync.recordOrderChanged(result.survivingOrder.id, 'order.table_merged');
      notifyKdsUpdate();

      res.json({
        order: result.survivingOrder,
        sourceOrderId: result.sourceOrderId,
        survivingTable: result.survivingTable,
        sourceTable: result.sourceTable,
      });
    } catch (error: unknown) {
      sendTableError(res, error);
    }
  },
);

router.post(
  '/:id/split',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const sourceTableId = req.params.id as string;
      const { target_table_id, order_item_ids } = req.body;
      if (!target_table_id) {
        return res.status(400).json({ error: 'target_table_id is required' });
      }
      if (!Array.isArray(order_item_ids) || order_item_ids.length === 0) {
        return res.status(400).json({ error: 'order_item_ids is required' });
      }

      const result = splitOrderToTable({
        sourceTableId,
        targetTableId: target_table_id,
        orderItemIds: order_item_ids,
        actorUserId: actorId(req),
      });

      cloudSync.recordOrderChanged(result.newOrder.id, 'order.table_split');
      notifyKdsUpdate();

      res.json({
        sourceOrder: result.sourceOrder,
        newOrder: result.newOrder,
        sourceTable: result.sourceTable,
        targetTable: result.targetTable,
      });
    } catch (error: unknown) {
      sendTableError(res, error);
    }
  },
);

router.post(
  '/:id/assign-waiter',
  requireRole('owner', 'manager'),
  (req: Request, res: Response) => {
    try {
      const waiterUserId =
        req.body.waiter_user_id === undefined || req.body.waiter_user_id === null
          ? null
          : String(req.body.waiter_user_id);

      const table = assignWaiterToTable({
        tableId: req.params.id as string,
        waiterUserId,
        actorUserId: actorId(req),
      });
      res.json({ table });
    } catch (error: unknown) {
      sendTableError(res, error);
    }
  },
);

router.patch(
  '/:id/status',
  requireRole('owner', 'manager'),
  validateParams(tableIdParamsSchema),
  validateBody(tableStatusBodySchema),
  (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const table = applyTableStatus({
        tableId: req.params.id as string,
        status,
        actorUserId: actorId(req),
      });
      res.json({ table });
    } catch (error: unknown) {
      sendTableError(res, error);
    }
  },
);

export const tableRoutes = router;
