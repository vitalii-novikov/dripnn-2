/**
 * Гардероб 3×3 — серверная часть (Google Apps Script).
 *
 * Данные:
 *  - лист ответов Google Form — источник вещей, скрипт его только читает;
 *  - лист Blocks — 9 блоков: slot | name | aliases (прежние названия через перенос строки);
 *  - лист State  — itemId | tier | deleted | shared | updatedAt.
 *
 * id вещи = Drive-id фото из ответа формы. Функции с «_» в конце не видны
 * клиенту через google.script.run.
 */

const TIERS = ['S', 'A', 'B', 'C', 'D', 'E'];
const SLOTS = 9;
const MAX_NAME = 80;
const SHARE_PER_LOAD = 20;
const LOCK_TIMEOUT_MS = 10000;
/** State.tier: '' — тир не менялся в приложении (действует ответ формы), NO_TIER — сброшен в приложении. */
const NO_TIER = 'none';

const BLOCKS_HEADERS = ['slot', 'name', 'aliases'];
const STATE_HEADERS = ['itemId', 'tier', 'deleted', 'shared', 'updatedAt'];
/** Названия вопросов формы — по-русски или по-английски. */
const COLUMNS = {
  block: ['Блок', 'Block'],
  photo: ['Фото', 'Photo'],
  name: ['Название', 'Name'],
  size: ['Размер', 'Size'],
  tier: ['Тир', 'Tier'],
};
const PROP = {
  spreadsheet: 'SPREADSHEET_ID',
  formId: 'FORM_ID',
  formUrl: 'FORM_URL',
  blockEntry: 'BLOCK_ENTRY',
  formWarning: 'FORM_WARNING',
};

// ─────────────────────────── Точки входа ───────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Гардероб')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Запускать из редактора после привязки формы к таблице. Можно запускать повторно. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Запустите setup из редактора скрипта, привязанного к таблице');
  props_().setProperty(PROP.spreadsheet, ss.getId());
  responseSheet_(ss);
  const freshBlocks = ensureSheet_(ss, 'Blocks', BLOCKS_HEADERS, [2, 3]);
  ensureSheet_(ss, 'State', STATE_HEADERS, [1, 2, 5]);
  if (freshBlocks) writeBlocks_(ss, seedBlocks_([]));

  let formStatus;
  try {
    formStatus = configureForm_(ss, freshBlocks);
  } catch (e) {
    formStatus = 'форма: ' + message_(e);
  }
  const sharing = shareAll_(ss);
  const summary = 'Готово: ' + formStatus + '; открыт доступ к фото: ' + sharing.shared + ', ошибок: ' + sharing.failed;
  console.log(summary);
  return summary;
}

// RPC для страницы. Каждый возвращает { ok: true, data } или { ok: false, error }.

function getData() {
  return rpc_(() => loadData_(spreadsheet_()));
}

function setTier(input) {
  return rpc_(() => {
    const tier = tierOf_(input);
    const ss = spreadsheet_();
    const itemId = knownItemId_(ss, input);
    patchState_(ss, (state, now) => upsert_(state, itemId, { tier: tier }, now));
    return null;
  });
}

function deleteItem(input) {
  return rpc_(() => {
    const ss = spreadsheet_();
    const itemId = knownItemId_(ss, input);
    patchState_(ss, (state, now) => upsert_(state, itemId, { deleted: true }, now));
    try {
      DriveApp.getFileById(itemId).setTrashed(true);
      return { warning: null };
    } catch (e) {
      return { warning: isGone_(e) ? null : 'Вещь удалена, но фото осталось в Drive: ' + message_(e) };
    }
  });
}

function renameBlocks(input) {
  return rpc_(() => {
    const ss = spreadsheet_();
    const blocks = withLock_(() => {
      const next = renamed_(readBlocks_(ss), input && input.names);
      writeBlocks_(ss, next);
      return next;
    });
    try {
      blockListItem_(openForm_()).setChoiceValues(blocks.map((b) => b.name).filter(Boolean));
      props_().deleteProperty(PROP.formWarning);
    } catch (e) {
      props_().setProperty(PROP.formWarning, 'Список «Блок» в форме не обновлён: ' + message_(e));
    }
    return blocks;
  });
}

// ─────────────────────────── Загрузка данных ───────────────────────────

function loadData_(ss) {
  const responses = readResponses_(ss);
  const blocks = readBlocks_(ss);
  let state = readState_(ss);
  const fresh = unshared_(buildCatalog_(responses, blocks, state).items, state, false).slice(0, SHARE_PER_LOAD);
  if (fresh.length > 0) state = share_(ss, fresh);

  const catalog = buildCatalog_(responses, blocks, state);
  const visible = new Set(catalog.items.map((i) => i.id));
  const unshared = state.filter((r) => visible.has(r.itemId) && !r.shared).length;
  const warnings = catalog.warnings.slice();
  if (unshared > 0) warnings.push('Не удалось открыть доступ к фото: ' + unshared + ' — запустите setup ещё раз');
  const formWarning = props_().getProperty(PROP.formWarning);
  if (formWarning) warnings.push(formWarning);
  return {
    blocks: blocks,
    items: catalog.items,
    formUrl: props_().getProperty(PROP.formUrl),
    blockEntry: props_().getProperty(PROP.blockEntry),
    warnings: warnings,
  };
}

/** Ответы формы → вещи. Удалённые скрыты, блок ищется по текущему или прежнему названию. */
function buildCatalog_(responses, blocks, state) {
  const col = columns_(responses.headers);
  if (col.block < 0 || col.photo < 0) throw new Error('В листе ответов формы нет колонок «Блок» и «Фото»');
  const cell = (row, i) => (i < 0 ? '' : String(row[i] == null ? '' : row[i]).trim());

  const stateById = new Map(state.map((r) => [r.itemId, r]));
  const slotByName = new Map();
  // Сначала прежние названия, потом текущие: текущее название всегда побеждает.
  blocks.forEach((b) => b.aliases.forEach((a) => slotByName.set(norm_(a), b.slot)));
  blocks.forEach((b) => b.name && slotByName.set(norm_(b.name), b.slot));

  const seen = new Set();
  const items = [];
  let invalid = 0;
  let duplicates = 0;
  responses.rows.forEach((row) => {
    const id = driveId_(row[col.photo]);
    if (!id) return void (invalid += 1);
    if (seen.has(id)) return void (duplicates += 1);
    seen.add(id);
    const saved = stateById.get(id);
    if (saved && saved.deleted) return;
    items.push({
      id: id,
      slot: slotByName.has(norm_(row[col.block])) ? slotByName.get(norm_(row[col.block])) : null,
      name: cell(row, col.name),
      size: cell(row, col.size),
      tier: saved && saved.tier !== undefined ? saved.tier : asTier_(cell(row, col.tier)),
      addedAt: text_(row[0]),
    });
  });

  const warnings = [];
  if (invalid) warnings.push('Ответов без распознанного фото: ' + invalid);
  if (duplicates) warnings.push('Повторных ответов с тем же фото: ' + duplicates);
  return { items: items, warnings: warnings };
}

/** Drive-id из ячейки загрузки файла: open?id=…, /file/d/…/ или сам id. Ровно один, иначе null. */
function driveId_(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^[\w-]{10,}$/.test(text)) return text;
  const ids = new Set();
  [/[?&]id=([\w-]{10,})/g, /\/file\/d\/([\w-]{10,})/g].forEach((re) => {
    let m;
    while ((m = re.exec(text)) !== null) ids.add(m[1]);
  });
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

// ─────────────────────────── Блоки ───────────────────────────

function parseBlocks_(rows) {
  const bySlot = new Map();
  rows.forEach((row) => {
    const slot = Number(row[0]);
    if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS || bySlot.has(slot)) return;
    bySlot.set(slot, { slot: slot, name: String(row[1] || '').trim(), aliases: dedupe_(String(row[2] || '').split('\n')) });
  });
  return range_(SLOTS).map((i) => bySlot.get(i + 1) || { slot: i + 1, name: '', aliases: [] });
}

function seedBlocks_(choices) {
  return range_(SLOTS).map((i) => ({ slot: i + 1, name: String(choices[i] || '').trim(), aliases: [] }));
}

/**
 * Изменённое название уходит в aliases своего блока, чтобы старые ответы формы
 * остались на месте. Alias, совпавший с любым новым названием, выбрасывается —
 * поэтому два блока можно поменять названиями.
 */
function renamed_(blocks, names) {
  if (!Array.isArray(names) || names.length !== SLOTS || names.some((n) => typeof n !== 'string')) throw new Error('Нужно ровно 9 названий');
  const trimmed = names.map((n) => n.trim());
  if (trimmed.some((n) => n.length > MAX_NAME)) throw new Error('Название блока — не длиннее ' + MAX_NAME + ' символов');
  const occupied = new Map();
  trimmed.forEach((name, i) => {
    if (!name) return;
    if (occupied.has(norm_(name))) throw new Error('Одинаковые названия у блоков ' + occupied.get(norm_(name)) + ' и ' + (i + 1));
    occupied.set(norm_(name), i + 1);
  });
  return blocks.map((block, i) => {
    const name = trimmed[i];
    const renamedFrom = block.name && norm_(block.name) !== norm_(name) ? [block.name] : [];
    const aliases = dedupe_(renamedFrom.concat(block.aliases)).filter((a) => !occupied.has(norm_(a)));
    return { slot: block.slot, name: name, aliases: aliases };
  });
}

// ─────────────────────────── Состояние и фото ───────────────────────────

function upsert_(state, itemId, patch, now) {
  const existing = state.find((r) => r.itemId === itemId);
  const updated = Object.assign({ itemId: itemId, tier: undefined, deleted: false, shared: false }, existing, patch, { updatedAt: now });
  return existing ? state.map((r) => (r === existing ? updated : r)) : state.concat([updated]);
}

/** Чтение-слияние-запись State под блокировкой. */
function patchState_(ss, apply) {
  return withLock_(() => {
    const next = apply(readState_(ss), new Date().toISOString());
    writeState_(ss, next);
    return next;
  });
}

function unshared_(items, state, retryFailed) {
  const byId = new Map(state.map((r) => [r.itemId, r]));
  return items.filter((item) => {
    const record = byId.get(item.id);
    return !record || (retryFailed && !record.shared);
  });
}

/** Открывает фото «всем по ссылке» (вне блокировки — Drive медленный), итог пишет одной записью. */
function share_(ss, items) {
  const results = items.map((item) => {
    try {
      DriveApp.getFileById(item.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return { id: item.id, shared: true };
    } catch (e) {
      console.warn('share ' + item.id + ': ' + message_(e));
      return { id: item.id, shared: false };
    }
  });
  return patchState_(ss, (state, now) => results.reduce((acc, r) => upsert_(acc, r.id, { shared: r.shared }, now), state));
}

function shareAll_(ss) {
  const state = readState_(ss);
  const items = unshared_(buildCatalog_(readResponses_(ss), readBlocks_(ss), state).items, state, true);
  if (items.length === 0) return { shared: 0, failed: 0 };
  const after = share_(ss, items);
  const failed = items.filter((i) => !after.find((r) => r.itemId === i.id).shared).length;
  return { shared: items.length - failed, failed: failed };
}

/** Менять можно только фото, пришедшие через форму, — не любой файл на Drive. */
function knownItemId_(ss, input) {
  const id = input && input.itemId;
  if (typeof id !== 'string' || !/^[\w-]{10,}$/.test(id)) throw new Error('Некорректный id вещи');
  const known = readResponses_(ss).rows.some((row) => row.some((c) => typeof c === 'string' && c.indexOf(id) >= 0));
  if (!known) throw new Error('Такой вещи нет в ответах формы');
  return id;
}

function tierOf_(input) {
  const tier = input ? input.tier : undefined;
  if (tier === null) return null;
  if (TIERS.indexOf(tier) >= 0) return tier;
  throw new Error('Некорректный тир');
}

// ─────────────────────────── Форма ───────────────────────────

/** Запоминает ссылку на форму и поле предзаполнения; при первом запуске берёт названия блоков из списка «Блок». */
function configureForm_(ss, seedNames) {
  const props = props_();
  [PROP.formId, PROP.formUrl, PROP.blockEntry].forEach((k) => props.deleteProperty(k));
  const url = ss.getFormUrl();
  if (!url) return 'форма не привязана к таблице — кнопка «Добавить» будет неактивна';
  const form = FormApp.openByUrl(url);
  props.setProperty(PROP.formId, form.getId());
  props.setProperty(PROP.formUrl, form.getPublishedUrl());
  const list = blockListItem_(form);
  const choices = list.getChoices().map((c) => String(c.getValue()));
  if (seedNames) writeBlocks_(ss, seedBlocks_(choices));
  if (choices[0]) {
    const prefilled = form.createResponse().withItemResponse(list.createResponse(choices[0])).toPrefilledUrl();
    const entry = /[?&]entry\.(\d+)=/.exec(prefilled);
    if (entry) props.setProperty(PROP.blockEntry, entry[1]);
  }
  return 'форма подключена, блоков в списке: ' + choices.length;
}

function openForm_() {
  const id = props_().getProperty(PROP.formId);
  if (!id) throw new Error('форма не найдена — запустите setup');
  return FormApp.openById(id);
}

function blockListItem_(form) {
  const item = form
    .getItems(FormApp.ItemType.LIST)
    .map((i) => i.asListItem())
    .find((i) => COLUMNS.block.indexOf(i.getTitle().trim()) >= 0);
  if (!item) throw new Error('в форме нет раскрывающегося списка «Блок»');
  return item;
}

// ─────────────────────────── Таблица ───────────────────────────

/** В web app нет getActiveSpreadsheet(): таблица открывается по id, который запомнил setup. */
function spreadsheet_() {
  const id = props_().getProperty(PROP.spreadsheet);
  if (!id) throw new Error('Приложение не настроено — запустите setup из редактора (deploy.md)');
  return SpreadsheetApp.openById(id);
}

function responseSheet_(ss) {
  const matches = ss.getSheets().filter((s) => s.getLastRow() > 0 && hasRequiredColumns_(headerRow_(s)));
  if (matches.length === 0) throw new Error('Не найден лист ответов формы с вопросами «Блок» и «Фото» — привяжите форму к таблице и отправьте одну вещь');
  if (matches.length > 1) throw new Error('Несколько листов с колонками «Блок» и «Фото» — оставьте один');
  return matches[0];
}

function readResponses_(ss) {
  const sheet = responseSheet_(ss);
  const headers = headerRow_(sheet);
  return { headers: headers, rows: bodyRows_(sheet, headers.length) };
}

function columns_(headers) {
  const titles = headers.map(norm_);
  const find = (key) => titles.findIndex((t) => COLUMNS[key].some((c) => norm_(c) === t));
  return { block: find('block'), photo: find('photo'), name: find('name'), size: find('size'), tier: find('tier') };
}

function hasRequiredColumns_(headers) {
  const col = columns_(headers);
  return col.block >= 0 && col.photo >= 0;
}

function readBlocks_(ss) {
  return parseBlocks_(bodyRows_(serviceSheet_(ss, 'Blocks'), BLOCKS_HEADERS.length));
}

function writeBlocks_(ss, blocks) {
  overwrite_(serviceSheet_(ss, 'Blocks'), blocks.map((b) => [b.slot, b.name, b.aliases.join('\n')]), BLOCKS_HEADERS.length);
}

function readState_(ss) {
  return bodyRows_(serviceSheet_(ss, 'State'), STATE_HEADERS.length)
    .filter((row) => text_(row[0]))
    .map((row) => {
      const raw = text_(row[1]);
      return {
        itemId: text_(row[0]),
        tier: raw === '' ? undefined : raw === NO_TIER ? null : asTier_(raw),
        deleted: bool_(row[2]),
        shared: bool_(row[3]),
        updatedAt: text_(row[4]),
      };
    });
}

function writeState_(ss, state) {
  const tierCell = (t) => (t === undefined ? '' : t === null ? NO_TIER : t);
  const values = state.map((r) => [r.itemId, tierCell(r.tier), r.deleted, r.shared, r.updatedAt]);
  overwrite_(serviceSheet_(ss, 'State'), values, STATE_HEADERS.length);
}

/** Возвращает true, если лист только что создан (или был пуст) — его можно заполнить. */
function ensureSheet_(ss, name, headers, textColumns) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const fresh = sheet.getLastRow() === 0;
  if (fresh) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
    const bad = headers.findIndex((h, i) => actual[i] !== h);
    if (bad >= 0) throw new Error('Лист «' + name + '»: колонка ' + (bad + 1) + ' должна называться «' + headers[bad] + '»');
  }
  sheet.setFrozenRows(1);
  textColumns.forEach((c) => sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@'));
  return fresh;
}

function serviceSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Нет служебного листа «' + name + '» — запустите setup');
  return sheet;
}

function headerRow_(sheet) {
  const width = sheet.getLastColumn();
  return width > 0 ? sheet.getRange(1, 1, 1, width).getValues()[0].map(text_) : [];
}

function bodyRows_(sheet, width) {
  const count = sheet.getLastRow() - 1;
  return count > 0 && width > 0 ? sheet.getRange(2, 1, count, width).getValues() : [];
}

/** Сначала пишет новые строки, потом чистит лишние — сбой посередине не оставит лист пустым. */
function overwrite_(sheet, values, width) {
  const oldRows = Math.max(0, sheet.getLastRow() - 1);
  if (values.length > 0) sheet.getRange(2, 1, values.length, width).setValues(values);
  if (oldRows > values.length) sheet.getRange(values.length + 2, 1, oldRows - values.length, width).clearContent();
}

// ─────────────────────────── Мелочи ───────────────────────────

function rpc_(fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, error: message_(e) };
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function isGone_(e) {
  return /not found|no item with the given id/i.test(message_(e));
}

function message_(e) {
  return e && typeof e.message === 'string' ? e.message : String(e);
}

function norm_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function text_(v) {
  const isDate = Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
  return isDate ? v.toISOString() : String(v == null ? '' : v);
}

function bool_(v) {
  return v === true || String(v).toLowerCase() === 'true';
}

function asTier_(v) {
  const t = String(v == null ? '' : v).trim().toUpperCase();
  return TIERS.indexOf(t) >= 0 ? t : null;
}

function dedupe_(values) {
  const seen = new Set();
  return values
    .map((v) => v.trim())
    .filter((v) => {
      if (!v || seen.has(norm_(v))) return false;
      seen.add(norm_(v));
      return true;
    });
}

function range_(n) {
  return Array.from({ length: n }, (_, i) => i);
}
