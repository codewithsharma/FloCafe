'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/flo';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import { Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { register, selectTenant } = useAuthStore();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    business_name: '',
    business_type: 'restaurant',
    country: 'IN',
  });
  const passwordsEntered = form.password.length > 0 && form.password_confirmation.length > 0;
  const passwordsMatch = !passwordsEntered || form.password === form.password_confirmation;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      await register(form);
      const newTenants = useAuthStore.getState().tenants;
      if (newTenants.length > 0) {
        try {
          await selectTenant(newTenants[0].id);
        } catch {
          // ignore tenant auto-select errors, router.push proceeds
        }
      }
      toast.success(t('auth.accountCreated'));
      router.push('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { errors?: Record<string, string[]>; error?: string } } };
      const errors = error.response?.data?.errors;
      if (errors) {
        const firstError = Object.values(errors)[0]?.[0];
        toast.error(firstError || t('auth.registrationFailed'));
      } else {
        toast.error(error.response?.data?.error || t('auth.registrationFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    'h-9 w-full rounded-flo-md border border-flo-border bg-flo-surface px-3 text-sm text-flo-text outline-none focus-visible:border-flo-brand-500 focus-visible:ring-2 focus-visible:ring-flo-brand-500/30';

  return (
    <AuthShell
      maxWidth="lg"
      subtitle={t('auth.registerSubtitle')}
      footer={
        <p className="text-center text-sm text-flo-text-secondary">
          {t('auth.haveAccount')}{' '}
          <Link href="/auth/login" className="font-medium text-flo-brand-600 hover:text-flo-brand-700">
            {t('auth.signIn')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="register-name">{t('auth.yourName')}</Label>
            <Input id="register-name" type="text" name="name" value={form.name} onChange={handleChange} required />
          </div>

          <div className="col-span-2 space-y-2">
            <Label htmlFor="register-email">{t('auth.email')}</Label>
            <Input id="register-email" type="email" name="email" autoComplete="email" value={form.email} onChange={handleChange} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-password">{t('auth.password')}</Label>
            <div className="relative">
              <Input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
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
            <Label htmlFor="register-confirm">{t('auth.confirmPassword')}</Label>
            <div className="relative">
              <Input
                id="register-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                name="password_confirmation"
                autoComplete="new-password"
                value={form.password_confirmation}
                onChange={handleChange}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text focus:outline-none"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {passwordsEntered && (
            <div className="col-span-2 -mt-2">
              <p className={`text-xs font-medium ${passwordsMatch ? 'text-flo-success' : 'text-flo-danger'}`}>
                {passwordsMatch ? t('auth.passwordsMatch') : t('auth.passwordsDoNotMatch')}
              </p>
            </div>
          )}

          <div className="col-span-2 space-y-2 border-t border-flo-border pt-5 mt-1">
            <Label htmlFor="register-business">{t('auth.businessNameLabel')}</Label>
            <Input
              id="register-business"
              type="text"
              name="business_name"
              value={form.business_name}
              onChange={handleChange}
              placeholder={t('auth.businessNamePlaceholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-country">{t('auth.countryLabel')}</Label>
            <select id="register-country" name="country" value={form.country} onChange={handleChange} className={selectClass}>
              <option value="IN">{t('auth.countryIndia')}</option>
              <option value="TH">{t('auth.countryThailand')}</option>
            </select>
          </div>
        </div>

        <Button type="submit" disabled={loading || !passwordsMatch} className="w-full" size="lg">
          {loading ? t('auth.signingIn') : t('auth.createAccount')}
        </Button>
      </form>
    </AuthShell>
  );
}
