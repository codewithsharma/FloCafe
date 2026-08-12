'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import type { Staff } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { PageHeader, LoadingState } from '@/components/flo';
import {
  StaffGrid,
  StaffFormDialog,
  StaffResetPasswordDialog,
  type StaffFormState,
} from '@/components/staff';

const DEFAULT_FORM: StaffFormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'waiter',
  pin: '',
};

export default function StaffPage() {
  const { t } = useI18n();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwStaff, setResetPwStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffFormState>(DEFAULT_FORM);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const fetchStaff = async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(data.staff || []);
    } catch {
      toast.error(t('staff.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api
      .get('/staff')
      .then(({ data }) => setStaff(data.staff || []))
      .catch(() => toast.error(t('staff.failedToLoad')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditingStaff(null);
    setForm(DEFAULT_FORM);
    setShowPassword(false);
    setShowPin(false);
    setShowForm(true);
  };

  const openEdit = (s: Staff) => {
    setEditingStaff(s);
    setForm({
      name: s.name,
      email: s.email || '',
      password: '',
      confirmPassword: '',
      role: s.role,
      pin: '',
    });
    setShowPassword(false);
    setShowPin(false);
    setShowForm(true);
  };

  const openResetPw = (s: Staff) => {
    setResetPwStaff(s);
    setNewPassword('');
    setConfirmNewPassword('');
    setShowResetPassword(false);
    setShowResetPw(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      toast.error(t('setup.passwordsMismatch'));
      return;
    }
    try {
      if (editingStaff) {
        await api.put(`/staff/${editingStaff.id}`, {
          name: form.name,
          email: form.email || null,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
          ...(form.pin ? { pin: form.pin } : {}),
        });
        toast.success(t('staff.updatedToast'));
      } else {
        await api.post('/staff', {
          name: form.name,
          email: form.email || null,
          password: form.password,
          role: form.role,
          ...(form.pin ? { pin: form.pin } : {}),
        });
        toast.success(t('staff.addedToast'));
      }
      closeForm();
      fetchStaff();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || t('staff.failedToSave'));
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwStaff || !newPassword) return;
    if (newPassword !== confirmNewPassword) {
      toast.error(t('setup.passwordsMismatch'));
      return;
    }
    try {
      await api.put(`/staff/${resetPwStaff.id}`, { password: newPassword });
      toast.success(t('staff.resetPasswordToast'));
      closeResetPassword();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || t('staff.failedToReset'));
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setShowPassword(false);
    setShowPin(false);
  };

  const closeResetPassword = () => {
    setShowResetPw(false);
    setShowResetPassword(false);
  };

  const toggleActive = async (s: Staff) => {
    try {
      await api.post(`/staff/${s.id}/${s.is_active ? 'deactivate' : 'reactivate'}`);
      fetchStaff();
    } catch {
      toast.error(t('staff.failedToUpdate'));
    }
  };

  const editingLastActiveOwner =
    Boolean(editingStaff?.is_active) &&
    editingStaff?.role === 'owner' &&
    staff.filter((s) => s.role === 'owner' && Boolean(s.is_active)).length === 1;

  return (
    <div>
      <PageHeader
        title={t('staff.title')}
        actions={
          <Button onClick={openAdd} className="min-h-11">
            <Plus size={16} className="mr-1" /> {t('staff.addButton')}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <StaffGrid
          staff={staff}
          onEdit={openEdit}
          onResetPassword={openResetPw}
          onToggleActive={toggleActive}
          onAdd={openAdd}
        />
      )}

      <StaffFormDialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeForm();
          else setShowForm(true);
        }}
        editing={Boolean(editingStaff)}
        form={form}
        onFormChange={setForm}
        onSubmit={handleSave}
        showPassword={showPassword}
        onTogglePassword={() => setShowPassword(!showPassword)}
        showPin={showPin}
        onTogglePin={() => setShowPin(!showPin)}
        editingLastActiveOwner={editingLastActiveOwner}
      />

      <StaffResetPasswordDialog
        staff={resetPwStaff}
        open={showResetPw && Boolean(resetPwStaff)}
        onOpenChange={(open) => {
          if (!open) closeResetPassword();
          else setShowResetPw(true);
        }}
        newPassword={newPassword}
        confirmNewPassword={confirmNewPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmNewPasswordChange={setConfirmNewPassword}
        showPassword={showResetPassword}
        onTogglePassword={() => setShowResetPassword(!showResetPassword)}
        onSubmit={handleResetPassword}
      />
    </div>
  );
}
