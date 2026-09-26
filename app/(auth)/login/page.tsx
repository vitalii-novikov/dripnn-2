import type { Metadata } from 'next';

import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = {
  title: 'Вход — Гардероб',
  description: 'Вход в личный каталог гардероба по одноразовой ссылке.',
};

export default function LoginPage() {
  return (
    <main className={styles.pageWrapper}>
      <div className={styles.loginCard}>
        <header className={styles.header}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} aria-hidden="true" />
            <span>Гардероб</span>
          </div>

          <h1 className={styles.title}>Вход в каталог</h1>

          <p className={styles.subtitle}>
            Личный доступ для разбора вещей. Введите почту — пришлём ссылку для входа.
          </p>
        </header>

        <LoginForm />
      </div>
    </main>
  );
}
