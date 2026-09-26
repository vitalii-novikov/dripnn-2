// Сверяет закоммиченные типы БД с тем, что сейчас генерирует схема.
// Расхождение означает, что миграция уехала вперёд типов — и TypeScript будет
// уверенно врать про форму данных.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = path.resolve('lib/supabase/database.types.ts');

function generated() {
  return execFileSync(
    path.resolve('node_modules', '.bin', 'supabase'),
    ['gen', 'types', 'typescript', '--local'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
}

function normalize(source) {
  return source.replace(/\r\n/gu, '\n').trimEnd();
}

const expected = normalize(generated());
const actual = normalize(readFileSync(CONTRACT_PATH, 'utf8'));

if (expected !== actual) {
  console.error(
    `${CONTRACT_PATH} is out of sync with the database schema.\n` +
      'Regenerate it with: npm exec -- supabase gen types typescript --local > lib/supabase/database.types.ts',
  );
  process.exit(1);
}

console.log('Generated database types match the schema.');
