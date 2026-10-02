/**
 * Phone OTP sign-in (spec §5 / §7):
 *   step 1  enter mobile number  -> POST /auth/v1/otp
 *   step 2  enter 6-digit code   -> POST /auth/v1/verify
 *
 * Generic error copy only — the UI never reveals whether a number is
 * registered (no account enumeration). Client-side counters mirror the §7
 * limits (5 attempts per code, 3 requests per phone per 15 minutes) while the
 * server stays authoritative.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, KeyRound, Loader2, Send } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { OTP_RULES } from '../lib/constants.js';
import { isValidPHPhone, maskPhone } from '../lib/format.js';
import { buttonClasses } from '../lib/ui';
import { Alert } from '../components/ui/Alert.jsx';
import { Input } from '../components/ui/Input.jsx';

const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, 'Mobile number is required.')
    .refine((value) => isValidPHPhone(value), 'Enter a valid mobile number (09XXXXXXXXX).'),
});

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/my-bookings';
}

function Countdown({ seconds }) {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return (
    <span>
      Resend in {minutes}:{remainder}
    </span>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { status, isAuthenticated, isConfigured, sendOtp, verifyOtp, otpLimiter } = useAuth();

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [lockedFor, setLockedFor] = useState(0);

  const next = safeNext(searchParams.get('next'));

  const phoneForm = useForm({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
    mode: 'onBlur',
  });

  const codeForm = useForm({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
    mode: 'onBlur',
  });

  // Resend cooldown + hard §7 window both tick once per second.
  useEffect(() => {
    if (step !== 'otp') return undefined;
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
      setLockedFor(phone ? otpLimiter.secondsUntilNextRequest(phone) : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, [step, phone, otpLimiter]);

  if (status === 'loading') return null;

  if (isAuthenticated) {
    return <Navigate to={next} replace state={location.state} />;
  }

  const codeRegister = codeForm.register('code');

  async function handleSend(values) {
    setFormError('');
    setSending(true);
    try {
      const { phone: normalized } = await sendOtp(values.phone);
      setPhone(normalized);
      setStep('otp');
      setCooldown(60);
      setLockedFor(otpLimiter.secondsUntilNextRequest(normalized));
      codeForm.reset({ code: '' });
    } catch (error) {
      setFormError(error.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(values) {
    setFormError('');
    setVerifying(true);
    try {
      await verifyOtp(phone, values.code);
      navigate(next, { replace: true });
    } catch (error) {
      setFormError(error.message ?? 'Something went wrong. Please try again.');
      codeForm.setValue('code', '');
      codeForm.setFocus('code');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setFormError('');
    setSending(true);
    try {
      await sendOtp(phone);
      setCooldown(60);
      setLockedFor(otpLimiter.secondsUntilNextRequest(phone));
      codeForm.reset({ code: '' });
    } catch (error) {
      setFormError(error.message ?? 'Something went wrong. Please try again.');
      setLockedFor(otpLimiter.secondsUntilNextRequest(phone));
    } finally {
      setSending(false);
    }
  }

  const resendBlocked = cooldown > 0 || lockedFor > 0;
  const attemptsLeft = phone ? otpLimiter.remainingAttempts(phone) : OTP_RULES.maxAttempts;

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Log in</h1>
      <p className="mt-1 text-sm text-slate-600">
        {step === 'phone'
          ? 'Sign in with your mobile number to book and manage courts.'
          : 'Enter the code we sent by SMS.'}
      </p>

      {!isConfigured ? (
        <Alert variant="warning" className="mt-6">
          Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to
          .env.local to enable phone sign-in.
        </Alert>
      ) : null}

      {formError ? (
        <Alert variant="danger" className="mt-6">
          {formError}
        </Alert>
      ) : null}

      {step === 'phone' ? (
        <form className="mt-6 space-y-4" onSubmit={phoneForm.handleSubmit(handleSend)} noValidate>
          <Input
            label="Mobile number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="09171234567"
            required
            disabled={!isConfigured || sending}
            error={phoneForm.formState.errors.phone?.message}
            hint="We'll text you a one-time code. Standard rates may apply."
            {...phoneForm.register('phone')}
          />
          <button
            type="submit"
            className={`${buttonClasses({ variant: 'primary', size: 'lg' })} w-full`}
            disabled={!isConfigured || sending}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {sending ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={codeForm.handleSubmit(handleVerify)} noValidate>
          <p className="text-sm text-slate-600">
            Code sent to <span className="font-medium text-slate-900">{maskPhone(phone)}</span>
          </p>
          <Input
            label="One-time code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            required
            disabled={!isConfigured || verifying}
            error={codeForm.formState.errors.code?.message}
            hint={`${OTP_RULES.maxAttempts} attempts allowed per code.`}
            {...codeRegister}
            onChange={(event) => {
              const input = event.target;
              input.value = input.value.replace(/\D/g, '').slice(0, 6);
              codeRegister.onChange(event);
            }}
          />
          <button
            type="submit"
            className={`${buttonClasses({ variant: 'primary', size: 'lg' })} w-full`}
            disabled={!isConfigured || verifying}
          >
            {verifying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {verifying ? 'Verifying…' : 'Verify code'}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setFormError('');
                setCooldown(0);
                setLockedFor(0);
                phoneForm.reset({ phone: '' });
              }}
              className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Change number
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={!isConfigured || sending || resendBlocked}
              className="font-medium text-brand-700 hover:text-brand-800 disabled:pointer-events-none disabled:text-slate-400"
            >
              {sending ? (
                'Sending…'
              ) : resendBlocked ? (
                <Countdown seconds={Math.max(cooldown, lockedFor)} />
              ) : (
                'Resend code'
              )}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            {attemptsLeft} of {OTP_RULES.maxAttempts} attempts left on this code.
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-sm text-slate-600">
        <Link to="/" className="font-medium text-brand-700 hover:text-brand-800">
          Back to home
        </Link>
      </p>
    </div>
  );
}
