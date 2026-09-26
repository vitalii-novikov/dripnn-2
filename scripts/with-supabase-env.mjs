// Прокидывает адрес и ключи локального стека Supabase в дочернюю команду.
// Читаем их у CLI, а не из .env: файл рассинхронизируется молча, `supabase
// status` — нет.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

function binary(name) {
  return path.resolve('node_modules', '.bin', name);
}

function parseValue(raw) {
  const trimmed = raw.trim();
  return trimmed.startsWith('"') ? JSON.parse(trimmed) : trimmed;
}

function readLocalStackEnv() {
  const output = execFileSync(binary('supabase'), ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return Object.fromEntries(
    output
      .split(/\r?\n/u)
      .filter((line) => line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), parseValue(line.slice(separator + 1))];
      }),
  );
}

function childEnv() {
  const stack = readLocalStackEnv();
  const url = stack.API_URL;
  const anonKey = stack.ANON_KEY ?? stack.PUBLISHABLE_KEY;
  const serviceRoleKey = stack.SERVICE_ROLE_KEY ?? stack.SECRET_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'supabase status did not report API_URL, an anon key and a service-role key. Is the local stack running?',
    );
  }

  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  throw new Error('Expected a command to run');
}

const child = spawn(binary(command), args, { env: childEnv(), stdio: 'inherit' });

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
