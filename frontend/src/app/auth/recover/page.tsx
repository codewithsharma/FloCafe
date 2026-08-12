'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell, LoadingState } from '@/components/flo';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import { ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';

export default function RecoverAccessPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [email, setEmail] = useState('');
  const [masterPin, setMasterPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pinAvailable, setPinAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/auth/setup/status')
      .then(({ data }) => setPinAvailable(!!data.masterPinAvailable))
      .catch(() => {
        console.warn('[RecoverAccess] Could not verify Master PIN availability');
        setPinAvailable(false);
      });
  }, []);

  const passwordsEntered = newPassword.length > 0 && confirmPassword.length > 0;
  const passwordsMatch = !passwordsEntered || newPassword === confirmPassword;

  const isPasswordValid = (password: string) => {
    if (!password || password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{4}$/.test(masterPin)) {
      setFormError(t('auth.recoverPinFormat'));
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setFormError(t('auth.recoverPasswordRequirements'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(t('auth.recoverPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/recover-password', {
        email,
        master_pin: masterPin,
        new_password: newPassword,
      });
      toast.success(t('auth.recoverSuccess'));
      router.push('/auth/login');
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string } } };
      const status = error.response?.status;
      const serverMessage = error.response?.data?.error;

      if (status === 503) {
        setFormError(t('auth.recoverPinUnavailable'));
      } else if (status === 409) {
        setFormError(serverMessage || t('auth.recoverErrorGeneric'));
      } else if (status === 429) {
        setFormError(serverMessage || t('auth.recoverRateLimited'));
      } else if (status === 403) {
        setFormError(t('auth.recoverWrongPin'));
      } else if (status === 404) {
        setFormError(t('auth.recoverNoOwner'));
      } else if (status === 400) {
        setFormError(serverMessage || t('auth.recoverErrorGeneric'));
      } else {
        setFormError(serverMessage || t('auth.recoverErrorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      backLink={
        <button
          type="button"
          onClick={() => router.push('/auth/login')}
          className="flex items-center gap-1 text-sm text-flo-text-secondary hover:text-flo-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('auth.recoverBackToLogin')}
        </button>
      }
      icon={
        <div className="flex size-11 items-center justify-center rounded-flo-lg bg-flo-brand-50 text-flo-brand-600">
          <KeyRound className="w-5 h-5" />
        </div>
      }
      title={t('auth.recoverTitle')}
      subtitle={t('auth.recoverSubtitle')}
    >
      {pinAvailable === null ? (
        <LoadingState label={t('auth.recoverChecking')} className="min-h-[120px]" />
      ) : pinAvailable === false ? (
        <div className="py-4 text-center">
          <p className="text-sm font-medium text-flo-danger">{t('auth.recoverPinUnavailable')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recover-email">{t('auth.email')}</Label>
            <Input
              id="recover-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recover-pin">{t('auth.recoverPinLabel')}</Label>
            <p className="text-xs text-flo-text-secondary">{t('auth.recoverPinHint')}</p>
            <div className="relative">
              <Input
                id="recover-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={masterPin}
                onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                className="text-center text-lg tracking-[0.5em] pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text focus:outline-none"
                tabIndex={-1}
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">{t('auth.recoverNewPasswordLabel')}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('auth.recoverNewPasswordPlaceholder')}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">{t('auth.recoverConfirmPasswordLabel')}</Label>
              <Input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('auth.recoverConfirmPasswordPlaceholder')}
                required
              />
            </div>
          </div>

          {!isPasswordValid(newPassword) && newPassword.length > 0 && (
            <p className="text-xs font-medium text-flo-danger">{t('auth.recoverPasswordRequirements')}</p>
          )}
          {passwordsEntered && (
            <p className={`text-xs font-medium ${passwordsMatch ? 'text-flo-success' : 'text-flo-danger'}`}>
              {passwordsMatch ? t('setup.passwordsMatch') : t('setup.passwordsMismatch')}
            </p>
          )}

          {formError && (
            <p className="text-sm text-flo-danger text-center">{formError}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? t('auth.recoverSubmitting') : t('auth.recoverSubmit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
