'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Cloud,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Search,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { COUNTRIES, getCountryByCode, countryName, type Country } from '@/lib/countries';
import { getBrowserLanguage, t as translate, type Language } from '@/lib/i18n';
import {
  SetupShell,
  SetupStepHeader,
  SetupOptionCard,
  SetupNavFooter,
  type SetupProfile,
  type ServiceModel,
} from '@/components/setup';

const SETUP_PROFILES: Array<{ value: SetupProfile; badge?: 'express' | null }> = [
  { value: 'empty' },
  { value: 'express', badge: 'express' },
  { value: 'demo' },
];

const SERVICE_MODELS: Array<{ value: ServiceModel }> = [
  { value: 'qsr' },
  { value: 'finedine' },
];

// Mirrors main/services/cloud-sync.ts DEFAULT_CLOUD_SERVER_URL — kept in sync
// manually since the frontend can't import backend TS modules directly.
const DEFAULT_CLOUD_SERVER_URL = 'https://blue.flopos.com/';

function isPasswordValid(password: string): boolean {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

export default function SetupPage() {
  const { logout } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showMasterPin, setShowMasterPin] = useState(false);
  const [showConfirmMasterPin, setShowConfirmMasterPin] = useState(false);
  const [profile, setProfile] = useState<SetupProfile>('express');
  const [serviceModel, setServiceModel] = useState<ServiceModel>('qsr');
  const [language, setLanguage] = useState<Language>(() => getBrowserLanguage());
  const [browserLanguage] = useState<Language>(() => getBrowserLanguage());
  const [country, setCountry] = useState<string>('IN');
  const [countryQuery, setCountryQuery] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    business_name: '',
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [productUpdates, setProductUpdates] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);
  const [diagnosticsOptIn, setDiagnosticsOptIn] = useState(false);
  const passwordsEntered = form.password.length > 0 && form.confirmPassword.length > 0;
  const passwordsMatch = !passwordsEntered || form.password === form.confirmPassword;

  const [masterPinAvailable, setMasterPinAvailable] = useState<boolean | null>(null);
  const [masterPin, setMasterPin] = useState('');
  const [masterPinConfirm, setMasterPinConfirm] = useState('');
  const masterPinValid = /^\d{4}$/.test(masterPin) && masterPin === masterPinConfirm;

  const cloudEnabled = true;
  const [cloudServerUrl, setCloudServerUrl] = useState(DEFAULT_CLOUD_SERVER_URL);

  const passwordMeetsRequirements = form.password.length === 0 || isPasswordValid(form.password);

  useEffect(() => {
    let mounted = true;
    api.get('/auth/setup/status')
      .then(({ data }) => {
        if (!mounted) return;
        setMasterPinAvailable(!!data.masterPinAvailable);
        if (!data.needsSetup) {
          toast.error(translate('setup.alreadyComplete', language));
          window.location.replace('/auth/login');
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        console.warn('[Setup] Failed to check setup status:', err);
        setMasterPinAvailable(false);
      });
    return () => { mounted = false; };
  }, [language]);

  const selectedCountry: Country | undefined = getCountryByCode(country);
  const q = countryQuery.trim().toLowerCase();
  const languageOptions: Language[] = browserLanguage === 'es'
    ? ['es', 'pt', 'en']
    : browserLanguage === 'pt'
      ? ['pt', 'es', 'en']
      : ['en', 'es', 'pt'];
  const filteredCountries = COUNTRIES.filter((c) => {
    if (!q) return true;
    return (
      countryName(c.code).toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.currency.toLowerCase().includes(q) ||
      (c.locale ?? '').toLowerCase().includes(q)
    );
  });

  const t = (key: string) => translate(key, language);

  const completeSetup = () => {
    usePosSettingsStore.getState().setLanguage(language);
    api.put('/settings/language', { value: language }).catch((err: unknown) => {
      console.warn('[Setup] Failed to persist language setting:', err);
    });
    logout();
    toast.success(t('setup.completeSetupSuccess'));
    window.location.replace('/auth/login');
  };

  const validateOwner = () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error(t('setup.errorNameRequired'));
      return false;
    }
    if (!isPasswordValid(form.password)) {
      toast.error(t('setup.errorPasswordRequirementsNotMet'));
      return false;
    }
    if (form.password !== form.confirmPassword) {
      toast.error(t('setup.errorPasswordMismatch'));
      return false;
    }
    if (!termsAccepted) {
      toast.error(t('setup.errorTermsRequired'));
      return false;
    }
    return true;
  };

  const handleOwnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateOwner()) setStep(4);
  };

  const handleCompleteSetup = async () => {
    if (loading) return;
    if (!validateOwner()) {
      setStep(3);
      return;
    }
    if (masterPinAvailable && !masterPinValid) {
      toast.error(t('setup.masterPinRequired'));
      setStep(2);
      return;
    }

    if (cloudEnabled && cloudServerUrl.trim()) {
      try {
        const parsed = new URL(cloudServerUrl.trim());
        const localHttp = parsed.protocol === 'http:'
          && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
        if (parsed.protocol !== 'https:' && !localHttp) {
          toast.error(t('setup.errorCloudUrlHttps'));
          setStep(5);
          return;
        }
      } catch {
        toast.error(t('setup.errorCloudUrlInvalid'));
        setStep(5);
        return;
      }
    }

    setLoading(true);
    try {
      const countryProfile = selectedCountry;
      const countryCode = countryProfile?.code || country;
      const countryPayload = {
        country: countryCode,
        currency: countryProfile?.currency,
        timezone: countryProfile?.timezone,
        language,
      };

      await api.post('/auth/setup/initialize', {
        name: form.name,
        email: form.email,
        password: form.password,
        business_type: 'restaurant',
        business_name: form.business_name || undefined,
        setup_profile: profile,
        service_model: serviceModel,
        terms_accepted: termsAccepted,
        master_pin: masterPinAvailable ? masterPin : undefined,
        cloud_sync_enabled: true,
        cloud_server_url: cloudServerUrl.trim() || DEFAULT_CLOUD_SERVER_URL,
        email_product_updates: productUpdates,
        email_marketing: marketing,
        telemetry_opt_in: telemetryOptIn,
        diagnostics_opt_in: diagnosticsOptIn,
        ...countryPayload,
      });
      completeSetup();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr.response?.data?.error || t('setup.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const renderFooter = () => {
    if (step === 1) {
      return (
        <SetupNavFooter
          t={t}
          showBack={false}
          onContinue={() => setStep(2)}
        />
      );
    }
    if (step === 2) {
      return (
        <SetupNavFooter
          t={t}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
          continueDisabled={masterPinAvailable === true && !masterPinValid}
        />
      );
    }
    if (step === 4) {
      return (
        <SetupNavFooter
          t={t}
          onBack={() => setStep(3)}
          onContinue={() => setStep(5)}
        />
      );
    }
    if (step === 5) {
      return (
        <SetupNavFooter
          t={t}
          onBack={() => setStep(4)}
          onContinue={() => setStep(6)}
        />
      );
    }
    if (step === 6) {
      return (
        <SetupNavFooter
          t={t}
          onBack={() => setStep(5)}
          onContinue={handleCompleteSetup}
          continueLabel={t('setup.completeSetup')}
          continueDisabled={loading}
          continueLoading={loading}
        />
      );
    }
    return null;
  };

  return (
    <SetupShell
      step={step}
      title={t('setup.welcome')}
      tagline={t('setup.tagline')}
      t={t}
      footer={renderFooter()}
    >
      {step === 1 && (
        <div className="space-y-5">
          <SetupStepHeader
            title={t('setup.chooseLanguage')}
            description={t('setup.chooseLanguageHint')}
          />

          <div className="grid grid-cols-3 gap-2">
            {languageOptions.map((option) => {
              const label = option === 'es'
                ? t('setup.languageSpanish')
                : option === 'pt'
                  ? t('setup.languagePortuguese')
                  : t('setup.languageEnglish');
              return (
                <SetupOptionCard
                  key={option}
                  selected={language === option}
                  onSelect={() => setLanguage(option)}
                  title={label}
                  description={option.toUpperCase()}
                  compact
                />
              );
            })}
          </div>

          <div className="space-y-3">
            <SetupStepHeader
              title={t('setup.chooseCountry')}
              description={t('setup.chooseCountryHint')}
              className="mb-0"
            />

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted"
              />
              <Input
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder={t('setup.searchPlaceholder')}
                className="min-h-10 pl-9"
              />
            </div>

            <div className="grid max-h-52 gap-1.5 overflow-y-auto pr-1">
              {filteredCountries.map((c) => (
                <SetupOptionCard
                  key={c.code}
                  selected={country === c.code}
                  onSelect={() => setCountry(c.code)}
                  title={countryName(c.code)}
                  description={`${c.currency} · ${c.taxIdLabel || t('setup.noTaxId')} · ${c.locale}`}
                  compact
                />
              ))}
              {q && filteredCountries.length === 0 && (
                <p className="py-6 text-center text-small text-flo-text-muted">
                  {t('setup.noMatches').replace('{query}', countryQuery)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <SetupStepHeader
            icon={<KeyRound className="h-4 w-4" />}
            title={t('setup.setMasterPinTitle')}
            description={t('setup.setMasterPinDescription')}
            note={t('setup.masterPinRecoveryNote')}
          />

          {masterPinAvailable === false ? (
            <p className="rounded-flo-md bg-flo-surface-muted px-3 py-3 text-center text-small text-flo-text-secondary">
              {t('setup.masterPinNotAvailable')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="master-pin">{t('setup.pinLabel')}</Label>
                <div className="relative">
                  <Input
                    id="master-pin"
                    type={showMasterPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={masterPin}
                    onChange={(e) => setMasterPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="min-h-10 pr-10 text-center text-lg tracking-[0.5em]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMasterPin(!showMasterPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text"
                    tabIndex={-1}
                    aria-label={showMasterPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showMasterPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="master-pin-confirm">{t('setup.confirmPinLabel')}</Label>
                <div className="relative">
                  <Input
                    id="master-pin-confirm"
                    type={showConfirmMasterPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={masterPinConfirm}
                    onChange={(e) => setMasterPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="min-h-10 pr-10 text-center text-lg tracking-[0.5em]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmMasterPin(!showConfirmMasterPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text"
                    tabIndex={-1}
                    aria-label={showConfirmMasterPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showConfirmMasterPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <SetupStepHeader
            title={t('setup.createOwner')}
            description={t('setup.ownerSubtitle')}
          />

          <form onSubmit={handleOwnerSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="name">{t('setup.ownerName')}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t('setup.ownerNamePlaceholder')}
                  className="min-h-10"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="email">{t('setup.ownerEmail')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={t('setup.ownerEmailPlaceholder')}
                  className="min-h-10"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('setup.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={t('setup.passwordPlaceholder')}
                    className="min-h-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t('setup.confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder={t('setup.confirmPasswordPlaceholder')}
                    className="min-h-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-flo-text-muted hover:text-flo-text"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {!passwordMeetsRequirements && (
              <p className="text-caption font-medium text-flo-danger">
                {t('setup.passwordRequirementsHint')}
              </p>
            )}
            {passwordsEntered && (
              <p className={`text-caption font-medium ${passwordsMatch ? 'text-flo-success' : 'text-flo-danger'}`}>
                {passwordsMatch ? t('setup.passwordsMatch') : t('setup.passwordsMismatch')}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="business_name">{t('setup.businessName')}</Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                placeholder={t('setup.businessNamePlaceholder')}
                className="min-h-10"
              />
            </div>

            <label className="flex items-start gap-2.5 text-small text-flo-text-secondary">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-flo-border-strong accent-flo-brand-600"
                required
              />
              <span>
                {t('setup.termsIntro')}{' '}
                <a href="https://flopos.com/terms" target="_blank" rel="noopener noreferrer" className="text-flo-brand-600 underline">
                  {t('setup.terms')}
                </a>
                ,{' '}
                <a href="https://flopos.com/privacy" target="_blank" rel="noopener noreferrer" className="text-flo-brand-600 underline">
                  {t('setup.privacy')}
                </a>
                , and{' '}
                <a href="https://flopos.com/disclaimer" target="_blank" rel="noopener noreferrer" className="text-flo-brand-600 underline">
                  {t('setup.disclaimer')}
                </a>
                .
              </span>
            </label>

            <div className="space-y-2.5 rounded-flo-md bg-flo-surface-muted px-3 py-3 text-small">
              <p className="font-medium text-flo-text">{t('setup.privacyDataTitle')}</p>
              <p className="text-caption text-flo-text-secondary">{t('setup.privacyDataIntro')}</p>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={telemetryOptIn}
                  onChange={(e) => setTelemetryOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-flo-border-strong accent-flo-brand-600"
                />
                <span>
                  <span className="font-medium text-flo-text">{t('setup.telemetryOptInLabel')}</span>
                  <span className="mt-0.5 block text-caption text-flo-text-secondary">{t('setup.telemetryOptInHint')}</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={diagnosticsOptIn}
                  onChange={(e) => setDiagnosticsOptIn(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-flo-border-strong accent-flo-brand-600"
                />
                <span>
                  <span className="font-medium text-flo-text">{t('setup.diagnosticsOptInLabel')}</span>
                  <span className="mt-0.5 block text-caption text-flo-text-secondary">{t('setup.diagnosticsOptInHint')}</span>
                </span>
              </label>
            </div>

            <div className="space-y-2.5 rounded-flo-md bg-flo-surface-muted px-3 py-3 text-small">
              <p className="font-medium text-flo-text">{t('setup.emailCommunicationTitle')}</p>
              <p className="text-caption text-flo-text-secondary">{t('setup.emailCommunicationIntro')}</p>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={productUpdates}
                  onChange={(e) => setProductUpdates(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-flo-border-strong accent-flo-brand-600"
                />
                <span className="text-flo-text-secondary">{t('setup.emailProductUpdates')}</span>
              </label>
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-flo-border-strong accent-flo-brand-600"
                />
                <span className="text-flo-text-secondary">{t('setup.emailMarketing')}</span>
              </label>
            </div>

            <SetupNavFooter
              t={t}
              onBack={() => setStep(2)}
              continueType="submit"
              continueDisabled={!passwordsMatch || !termsAccepted || !isPasswordValid(form.password)}
            />
          </form>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <SetupStepHeader
            title={t('setup.setupDataTitle')}
            description={t('setup.setupDataSubtitle')}
          />

          <div className="grid gap-2">
            {SETUP_PROFILES.map((item) => {
              const Icon = item.value === 'demo'
                ? Database
                : item.value === 'express'
                  ? Sparkles
                  : UtensilsCrossed;
              return (
                <SetupOptionCard
                  key={item.value}
                  selected={profile === item.value}
                  onSelect={() => setProfile(item.value)}
                  icon={<Icon className="h-4 w-4" />}
                  title={t(`setup.${item.value}Label`)}
                  description={t(`setup.${item.value}Desc`)}
                  details={t(`setup.${item.value}Details`)}
                  badge={item.badge ? (
                    <span className="rounded-full bg-flo-brand-600 px-2 py-0.5 text-[10px] font-medium leading-none text-white">
                      {t('setup.expressBadge')}
                    </span>
                  ) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-4">
          <SetupStepHeader
            icon={<Cloud className="h-4 w-4" />}
            title={t('setup.cloudTitle')}
            description={t('setup.cloudSubtitle')}
          />

          <div className="rounded-flo-md bg-flo-surface-muted px-3 py-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={cloudEnabled}
                disabled
                className="mt-0.5 h-4 w-4 rounded border-flo-border-strong"
              />
              <span>
                <span className="text-body font-medium text-flo-text">{t('setup.cloudAutoEnabledTitle')}</span>
                <span className="mt-0.5 block text-caption text-flo-text-secondary">
                  {t('setup.cloudAutoEnabledHint')}
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cloud-server-url">{t('setup.cloudUrlLabel')}</Label>
            <Input
              id="cloud-server-url"
              type="url"
              value={cloudServerUrl}
              onChange={(e) => setCloudServerUrl(e.target.value)}
              placeholder={DEFAULT_CLOUD_SERVER_URL}
              className="min-h-10"
            />
            <p className="text-caption text-flo-text-muted">{t('setup.cloudUrlHint')}</p>
          </div>

          <p className="rounded-flo-md bg-flo-surface-muted px-3 py-2.5 text-caption text-flo-text-secondary">
            {t('setup.cloudRecoveryNoteEnabled')}
          </p>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <SetupStepHeader
            title={t('setup.flowTitle')}
            description={t('setup.flowSubtitle')}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            {SERVICE_MODELS.map((item) => (
              <SetupOptionCard
                key={item.value}
                selected={serviceModel === item.value}
                onSelect={() => setServiceModel(item.value)}
                title={t(`setup.${item.value}Label`)}
                description={t(`setup.${item.value}Desc`)}
                details={t(`setup.${item.value}Details`)}
              />
            ))}
          </div>
        </div>
      )}
    </SetupShell>
  );
}
