# tf2-schema-snapshot

**English** | [Русский](#русский)

Daily-build TF2 schema snapshot as versioned JSON artifacts.

A scheduled GitHub Actions workflow fetches both Steam schema layers once a
day, merges them per defindex and publishes the result to the
`snapshot-release` branch (and optionally to npm). Consumers — trading
bots, marketplaces, tools — install a fixed version and stop depending on
Steam Web API availability, rate limits and API keys at runtime.

## Why

- **Steam Web API reliability.** `GetSchemaItems` applies aggressive
  rate limiting, and response shapes change over time. Building a catalog
  from live calls in production couples catalog availability to Steam's
  availability.
- **TF2 updates are infrequent.** The schema changes a handful of times
  per year. A daily prebuilt snapshot is strictly more reliable than
  polling every few hours.
- **The API key stays out of production.** With this repository, the key
  is configured once in GitHub Secrets of the snapshot builder.

## What's in the snapshot

Two Steam layers are merged per defindex — neither is complete alone:

| Layer | Source | Provides |
| --- | --- | --- |
| Structure | `items_game.txt` (GetSchemaURL) | prefab, craft_class, attributes, capabilities |
| Display | `GetSchemaItems/v0001` | market names, proper_name, item_quality, icons |

Artifacts (on the `snapshot-release` branch, `dist/`):

- `meta.json` — version, content hash, build timestamp, item count, languages;
- `items.json` — canonical EN item set (defindex-unique, merged);
- `i18n/<lang>/items.json` — localized item names (default: `ru`);
- `i18n/<lang>/qualities.json` — localized quality names (EN included).

Known schema anomalies are corrected in the snapshot itself: the 15
seasonal/event crate keys share a base prefab in Steam's output and get
their real market names restored (see `SCHEMA_EVENT_KEY_OVERRIDES` in
[src/schema-items.ts](src/schema-items.ts)).

## Usage

### From the release branch

```bash
curl -fsSL https://raw.githubusercontent.com/netrunner714/tf2-schema-snapshot/snapshot-release/dist/meta.json
```

Pin a commit SHA for reproducible builds.

### From npm (when the optional publisher is configured)

```bash
npm install tf2-schema-snapshot
```

```js
import { readFile } from "node:fs/promises";
const meta = JSON.parse(
  await readFile("node_modules/tf2-schema-snapshot/dist/meta.json", "utf8"),
);
```

## Local build

```bash
pnpm install
STEAM_API_KEY=<key> pnpm build:snapshot
```

Environment variables:

- `STEAM_API_KEY` — required, Steam Web API key;
- `SNAPSHOT_LANGUAGES` — comma-separated BCP-47 tags (default `ru`);
- `SNAPSHOT_OUT_DIR` — output directory (default `dist`).

## How it stays correct

- **Abort-on-partial-data discipline.** Any non-200 page, malformed body
  or broken cursor aborts the whole run — a partial catalog is
  indistinguishable from "Steam removed items", so it must never ship.
- **Retries with exponential backoff and jitter** on 429/5xx, plus an
  inter-language pause to stay inside Steam's burst budget.
- **Duplicate defindex guard.** The snapshot refuses to ship two items
  with the same defindex.
- **Content-hash change detection.** The workflow compares content
  hashes with the latest release and skips publishing when nothing
  changed.
- **Unit tests** cover the KeyValues parser, icon URL normalization
  (including the `image_inventory` CDN 404 case), market name
  reconstruction, the seasonal key overrides, pagination/cursor edge
  cases and the merge + diff logic.

## License

MIT

---

## Русский

**Русский** | [English](#english)

Ежедневный снапшот схемы TF2 в виде версионируемых JSON-артефактов.

Запланированный GitHub Actions workflow раз в сутки забирает оба слоя
Steam-схемы, объединяет их по defindex и публикует результат в ветку
`snapshot-release` (опционально — в npm). Потребители — торговые боты,
маркетплейсы, инструменты — устанавливают фиксированную версию и больше
не зависят в рантайме от доступности Steam Web API, rate-лимитов и
API-ключей.

## Зачем это нужно

- **Надёжность Steam Web API.** `GetSchemaItems` агрессивно ограничивает
  частоту запросов, а форма ответов меняется со временем. Сборка каталога
  из живых вызовов в продакшене привязывает доступность каталога к
  доступности Steam.
- **Обновления TF2 редки.** Схема меняется несколько раз в год.
  Ежедневный готовый снапшот надёжнее, чем опрос каждые несколько часов.
- **API-ключ не попадает в продакшен.** Ключ настраивается один раз в
  GitHub Secrets сборщика снапшотов.

## Что входит в снапшот

Два слоя Steam-схемы объединяются по defindex — по отдельности каждый
неполон:

| Слой | Источник | Содержимое |
| --- | --- | --- |
| Структура | `items_game.txt` (GetSchemaURL) | prefab, craft_class, attributes, capabilities |
| Отображение | `GetSchemaItems/v0001` | рыночные имена, proper_name, item_quality, иконки |

Артефакты (ветка `snapshot-release`, каталог `dist/`):

- `meta.json` — версия, хэш контента, время сборки, количество предметов,
  список языков;
- `items.json` — канонический набор предметов EN (уникальный по defindex,
  объединённый);
- `i18n/<lang>/items.json` — локализованные имена предметов (по умолчанию
  `ru`);
- `i18n/<lang>/qualities.json` — локализованные названия качеств
  (включая EN).

Известные аномалии схемы исправляются в самом снапшоте: 15
сезонных/событийных ключей от ящиков в выдаче Steam имеют общий базовый
prefab — их настоящие рыночные имена восстанавливаются (см.
`SCHEMA_EVENT_KEY_OVERRIDES` в [src/schema-items.ts](src/schema-items.ts)).

## Использование

### Из release-ветки

```bash
curl -fsSL https://raw.githubusercontent.com/netrunner714/tf2-schema-snapshot/snapshot-release/dist/meta.json
```

Для воспроизводимых сборок фиксируйте commit SHA.

### Из npm (когда настроена опциональная публикация)

```bash
npm install tf2-schema-snapshot
```

```js
import { readFile } from "node:fs/promises";
const meta = JSON.parse(
  await readFile("node_modules/tf2-schema-snapshot/dist/meta.json", "utf8"),
);
```

## Локальная сборка

```bash
pnpm install
STEAM_API_KEY=<ключ> pnpm build:snapshot
```

Переменные окружения:

- `STEAM_API_KEY` — обязательный ключ Steam Web API;
- `SNAPSHOT_LANGUAGES` — BCP-47 теги через запятую (по умолчанию `ru`);
- `SNAPSHOT_OUT_DIR` — выходной каталог (по умолчанию `dist`).

## Как обеспечивается корректность

- **Принцип отказа от частичных данных.** Любая не-200 страница,
  некорректное тело ответа или сломанный курсор прерывают весь запуск —
  частичный каталог неотличим от «Steam удалил предметы», поэтому он не
  должен публиковаться никогда.
- **Повторные попытки с экспоненциальной задержкой** на 429/5xx и пауза
  между языками, чтобы оставаться в лимитах Steam.
- **Защита от дубликатов defindex.** Снапшот не публикуется, если два
  предмета имеют одинаковый defindex.
- **Сравнение хэшей контента.** Workflow сравнивает хэш с последним
  релизом и пропускает публикацию, если ничего не изменилось.
- **Модульные тесты** покрывают парсер KeyValues, нормализацию URL
  иконок (включая случай 404 для `image_inventory` на CDN),
  восстановление рыночных имён, оверрайды сезонных ключей, граничные
  случаи пагинации и логику merge + diff.

## Лицензия

MIT
