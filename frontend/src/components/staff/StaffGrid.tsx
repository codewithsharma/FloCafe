'use client';

import { Edit, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, StatusBadge, EmptyState } from '@/components/flo';
import { staffRoleVariant } from '@/lib/flo-display';
import type { Staff } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

const ROLE_LABEL_KEY: Record<string, string> = {
  owner: 'staff.roleOwner',
  manager: 'staff.roleManager',
  cashier: 'staff.roleCashier',
  waiter: 'staff.roleWaiter',
  chef: 'staff.roleChef',
};

export interface StaffGridProps {
  staff: Staff[];
  onEdit: (s: Staff) => void;
  onResetPassword: (s: Staff) => void;
  onToggleActive: (s: Staff) => void;
  onAdd: () => void;
}

export function StaffGrid({
  staff,
  onEdit,
  onResetPassword,
  onToggleActive,
  onAdd,
}: StaffGridProps) {
  const { t } = useI18n();

  if (staff.length === 0) {
    return (
      <EmptyState
        title={t('staff.empty')}
        action={
          <Button onClick={onAdd} className="min-h-11">
            {t('staff.addButton')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {staff.map((s) => (
        <Panel
          key={s.id}
          variant="compact"
          className={cn(!s.is_active && 'opacity-60')}
          title={s.name}
          description={s.email || '—'}
          actions={
            <StatusBadge variant={staffRoleVariant(s.role)} className="capitalize">
              {ROLE_LABEL_KEY[s.role] ? t(ROLE_LABEL_KEY[s.role]) : s.role}
            </StatusBadge>
          }
          footer={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="min-h-11" onClick={() => onEdit(s)}>
                <Edit size={14} className="mr-1" /> {t('common.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => onResetPassword(s)}
              >
                <RotateCcw size={14} className="mr-1" /> {t('staff.resetPwButton')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'min-h-11',
                  s.is_active
                    ? 'text-flo-danger hover:text-flo-danger hover:bg-flo-danger-subtle'
                    : 'text-flo-success hover:text-flo-success hover:bg-flo-success-subtle',
                )}
                onClick={() => onToggleActive(s)}
              >
                {s.is_active ? t('staff.deactivate') : t('staff.reactivate')}
              </Button>
            </div>
          }
        >
          {Boolean(s.has_pin) && (
            <p className="text-caption text-flo-success">{t('staff.pinSet')}</p>
          )}
        </Panel>
      ))}
    </div>
  );
}
