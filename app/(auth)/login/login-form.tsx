'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { requestMagicLink } from './actions';
import { INITIAL_LOGIN_STATE } from './state';
import styles from './login.module.css';

const FALLBACK_ERROR = 'Не удалось отправить ссылку. Проверьте адрес и попробуйте снова.';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={styles.submitButton} aria-busy={pending}>
      {pending ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3.33334 8H12.6667M12.6667 8L8.66668 4M12.6667 8L8.66668 12"
              stroke="currentColor"
              strokeWidth="1.67"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </>
      )}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className={styles.errorBanner} id="login-error-message" role="alert">
      {/* Форма плюс цвет, а не только цвет: треугольник читается и без него. */}
      <svg
        className={styles.errorIcon}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function SentView({
  email,
  error,
  isResend,
  formAction,
  onChangeEmail,
}: {
  email: string;
  error?: string;
  isResend: boolean;
  formAction: (payload: FormData) => void;
  onChangeEmail: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Живая область, вставленная в DOM уже с содержимым, VoiceOver не озвучивает.
  // Поэтому подтверждение не «объявляется», а получает фокус.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.sentCard}>
      <div className={styles.sentBadge} aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      <div className={styles.sentContent}>
        <h2 className={styles.sentTitle} ref={headingRef} tabIndex={-1}>
          Проверьте почту
        </h2>
        <p className={styles.sentBody}>
          Мы отправили одноразовую ссылку на{' '}
          <span className={styles.sentEmailEcho}>{email}</span>. Откройте её на этом
          устройстве, чтобы войти.
        </p>
        <p className={`${styles.sentBody} ${styles.sentFootnote}`}>
          Если письмо не пришло за пару минут, проверьте папку «Спам».
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? <ErrorBanner message={error} /> : null}
        {!error && isResend ? (
          <p className={`${styles.sentBody} ${styles.sentFootnote}`}>Ссылка отправлена ещё раз.</p>
        ) : null}
      </div>

      <div className={styles.sentActions}>
        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <SubmitButton label="Отправить ещё раз" pendingLabel="Отправляем ссылку…" />
        </form>

        <button type="button" onClick={onChangeEmail} className={styles.secondaryButton}>
          Указать другую почту
        </button>
      </div>
    </div>
  );
}

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(requestMagicLink, INITIAL_LOGIN_STATE);

  // Вид держится отдельным состоянием, а не выводится из флага «пользователь
  // редактирует». Флаг некому было сбросить, и после «Указать другую почту»
  // экран навсегда оставался формой: письма уходили, а подтверждение не
  // возвращалось.
  const [view, setView] = useState<'form' | 'sent'>('form');
  const [isResend, setIsResend] = useState(false);
  const handledSentAt = useRef<number | null>(null);

  // Введённый адрес живёт в локальном состоянии: ошибка сервера не должна
  // стирать то, что человек уже напечатал.
  const [email, setEmail] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== 'sent' || state.sentAt === undefined) {
      return;
    }
    if (handledSentAt.current === state.sentAt) {
      return;
    }

    setIsResend(handledSentAt.current !== null);
    handledSentAt.current = state.sentAt;
    setView('sent');
  }, [state]);

  const displayedEmail = state.email ?? email;
  const errorMessage =
    state.status === 'error' ? (state.message ?? FALLBACK_ERROR) : undefined;

  if (view === 'sent') {
    return (
      <SentView
        email={displayedEmail}
        error={errorMessage}
        isResend={isResend}
        formAction={formAction}
        onChangeEmail={() => {
          // Сброс отметки: следующая отправка считается первой, а не повторной.
          handledSentAt.current = null;
          setIsResend(false);
          setView('form');
          requestAnimationFrame(() => emailRef.current?.focus());
        }}
      />
    );
  }

  return (
    <form action={formAction} className={styles.form} aria-busy={isPending}>
      <div aria-live="assertive" aria-atomic="true">
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>
          Электронная почта
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="name@example.com"
          value={email}
          ref={emailRef}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? 'login-error-message' : undefined}
          disabled={isPending}
          className={styles.input}
        />
      </div>

      <SubmitButton label="Получить ссылку для входа" pendingLabel="Отправляем ссылку…" />

      <div className={styles.srOnly} aria-live="polite">
        {isPending ? 'Отправляем ссылку для входа на указанную почту' : ''}
      </div>

      <p className={styles.hint}>Без пароля. Одноразовая ссылка придёт на почту.</p>
    </form>
  );
}
