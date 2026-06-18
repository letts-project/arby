# Arby — сортировка таблиц и host-дашборд

**Дата:** 2026-06-18
**Статус:** design (pre-implementation)

## 1. Контекст и цели

Arby — веб-интерфейс к [letts](../../../../letts/docs/superpowers/specs/2026-05-03-letts-design.md):
Go-бэкенд (`internal/`) фанит read/admin-запросы по кластеру dugdale-демонов, React 19 SPA
(`web/src/`, TanStack Router/Query/Table + Radix + Tailwind 4) их отображает.

Три фичи, **всё на фронтенде** (Go-бэкенд не трогаем):

1. **Click-to-sort** в полных (непагинируемых) таблицах.
2. **Натуральная сортировка** хостов по умолчанию (`s2 < s10`, а не `s10 < s2`).
3. **Host-дашборд** на `/config/$host` вместо дампа сырого JSON-конфига.

### Вне области

- Сортировка в таблицах **Missions** и **Exec**. Они пагинируются на сервере
  (100 строк/страницу; dugdale-API поддерживает только `order=created|finished`),
  поэтому клиентская сортировка отсортировала бы лишь видимую страницу, а не весь
  датасет — это вводит в заблуждение. Решено (выбор пользователя): сортировку туда не добавляем.
- Любые изменения протокола letts/dugdale и новые backend-эндпоинты.

## 2. Инвентарь таблиц

Две системы таблиц в `web/src`:

- **TanStack-гриды** (интерактивные, клик по строке → навигация): `MissionsTable.tsx`,
  `ExecTable.tsx`. **Не трогаем** (см. «Вне области»).
- **`DTable`-таблицы** (примитивы `DTable/DThead/DTh/DTr/DTd` в `components/Table.tsx`,
  обычный HTML, полные датасеты) — **получают сортировку**:
  - Dugdales — `routes/dugdales.tsx`;
  - Lanes — `routes/lanes.tsx`;
  - Dashboard → панели «Queues by lane» (`LanesSummary`) и «Recent failures»
    (`RecentFailures`) в `routes/index.tsx`;
  - новые таблицы на host-дашборде (см. §5).

Dashboard host-strip — это **карточки**, не таблица; ему нужен только натуральный
порядок по умолчанию (§4).

## 3. Фича 1 — сортируемые display-таблицы

Три переиспользуемых куска:

### 3.1. `web/src/lib/sort.ts`

Натуральный компаратор на `Intl.Collator` — единственная реализация натуральной
сортировки в проекте.

```ts
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Сравнивает строки натурально (s2 < s10), числа численно, булевы (false < true).
// null/undefined всегда уходят в конец (независимо от направления — обрабатывается
// до реверса в useTableSort, либо знаком). Разнотипицу не ожидаем (колонка
// однородна), но не падаем: приводим к строке как fallback.
export function compareValues(a: unknown, b: unknown): number
```

Поведение `null/undefined`: «пустые» значения всегда внизу. Реализуется так, что
компаратор возвращает порядок для непустых, а `useTableSort` после реверса для `desc`
гарантирует, что пустые остаются в конце (через сортировку с предварительным
разбиением на «есть значение / нет значения», либо через флаг — деталь реализации,
итог фиксирован: пусто = всегда внизу).

### 3.2. `web/src/hooks/useTableSort.ts`

```ts
export type SortDir = 'asc' | 'desc'
export interface SortState { key: string; dir: SortDir }

export function useTableSort<T>(
  accessors: Record<string, (row: T) => unknown>,
  initial: SortState,
): {
  sort: SortState
  toggle: (key: string) => void
  sorted: (rows: T[]) => T[]
}
```

- **toggle:** клик по активной колонке → разворот `asc⇄desc`; по другой → новая
  колонка, направление `asc`.
- **sorted:** стабильная сортировка **копии** массива (тай-брейк по исходному
  индексу, чтобы порядок был детерминирован); для `desc` — реверс сравнения, при этом
  пустые значения остаются внизу.
- **initial:** обязательный дефолт (колонка + направление) у каждой таблицы.

### 3.3. `SortableDTh` (в `components/Table.tsx`)

Обёртка над `DTh`: кликабельный `<th>` с индикатором и `aria-sort`.

```tsx
<SortableDTh sortKey="host" sort={sort} onToggle={toggle}>Host</SortableDTh>
```

- Иконки `lucide-react`: активная колонка — `ChevronUp` (asc) / `ChevronDown` (desc);
  неактивные — приглушённый `ChevronsUpDown`.
- `aria-sort="ascending|descending|none"`, `role`/`tabIndex`/`onKeyDown` (Enter/Space)
  для доступности и клавиатуры.
- Сохраняет проп `className` (для `text-right` числовых колонок).

### 3.4. Подключение к таблицам

Каждая таблица: объявляет `sortAccessors`, оборачивает заголовки в `SortableDTh`,
мапит по `sorted(rows)`. Бесп. JSX-ячейки (статус-точки, чипы, ссылки, кнопки pause)
сохраняются без изменений.

Дефолтная сортировка (`initial`):

| Таблица | Дефолт |
|---|---|
| Dugdales | `host asc` (натуральный — закрывает §4) |
| Lanes | `host asc`, тай-брейк по lane |
| Dashboard · Queues by lane | `host asc` |
| Dashboard · Recent failures | `finished desc` (как сейчас — свежие сверху) |
| Host-дашборд · Lanes | `name asc` |

Accessors (по колонкам):

- Dugdales: `host→h.id`, `labels→(h.labels?.[0] ?? '')`, `version→h.version`,
  `uptime→h.uptime_seconds`, `applied→h.applied_at`, `queued→h.queue_summary.queued`,
  `running→h.queue_summary.running`.
- Lanes: `host→l.host`, `lane→l.name`, `queued→l.queued`, `running→l.running`,
  `concurrency→l.concurrency`, `state→l.paused`.
- Recent failures: `outcome→m.outcome`, `mission→(m.mission_name||m.display_name||m.mission_id)`,
  `host→m.host`, `finished→m.time_finished`, `reason→m.fail_reason`.

## 4. Фича 2 — натуральный порядок хостов

Та же `compareValues` из `lib/sort.ts` (без хардкода натуралки в Go — иначе две
реализации и риск расхождения Go/JS):

- **Dugdales-таблица:** `useTableSort(..., { key: 'host', dir: 'asc' })` → натуральный
  порядок по умолчанию и кликабельная колонка Host.
- **Dashboard host-strip** (карточки): сортирую массив `hosts` коллатором по `id`
  перед рендером (одна строка `[...hosts].sort(...)`).

Бэкенд (`internal/registry/registry.go:101`) оставляет лексикографический порядок —
фронт приводит к натуральному. (Альтернатива — починить в Go; отклонена.)

## 5. Фича 3 — host-дашборд (`/config/$host`)

`routes/config.$host.tsx` из дампа `JsonView` превращается в операционный хаб одного
dugdale. Маршрут остаётся `/config/$host` (ссылки из Dugdales-таблицы и
Dashboard-карточек не трогаем; заголовок страницы — host id). Альтернатива
(`/dugdales/$host`) отклонена ради малого выигрыша при большем churn.

### 5.1. Данные — без новых эндпоинтов

Композиция существующих хуков (все кешируются агрегатором, поллятся на других
страницах с интервалом 4с):

- статус (online/version/uptime/applied/queue/labels) — `useDugdales()` →
  `.find(h => h.id === host)`;
- lanes хоста — `useLanes()` → фильтр по `host`;
- последние миссии — `useMissions({ host, limit: N })` (N ≈ 8–10);
- applied-конфиг — существующий `useConfig(host)`.

Альтернатива (таргетный `GET /api/dugdales/{host}`) отклонена: для типового кластера
fan-out кешируется, а это backend-код + тест.

### 5.2. Макет (сверху вниз)

1. **Шапка** (`PageHeader`): host id + `HostChip`, бейдж online/offline, версия.
   Кнопки Copy config и `BackButton` сохраняются.
2. **Статус-полоса**: компактные `Stat`-карточки — `queued`, `running`, `uptime`,
   `applied ago`; labels как кликабельные чипы (→ фильтр на `/dugdales`). Стиль из
   `HostCard`/`Stat` в `routes/index.tsx`.
3. **Lanes хоста** — сортируемая `DTable` (lane/queued/running/concurrency/state) с
   `pause/continue` через переиспользуемый `LaneToggle` + `useLaneActions` из
   `routes/lanes.tsx`. `EmptyState`, если lanes нет.
4. **Recent missions** — превью последних N миссий хоста (recent-first),
   ссылка «View all» → `/missions?host={id}`. Маленький `DTable`
   (status/mission/lane/duration/created), строки-ссылки на деталь миссии.
5. **Applied config** — сворачиваемый `<details>`, внутри прежний `JsonView`. Сырой
   конфиг сохраняется, просто уходит «под капот».

### 5.3. Состояния

- Skeleton при загрузке, `ErrorState` с retry.
- Offline-хост: показываем шапку + «offline», без живых данных.
- Unknown/unmanaged host (прямой заход по URL): аккуратный `ErrorState`/`EmptyState`
  («host не найден или unmanaged») — managed-only сюда линкуются, но защищаемся.

Чтобы переиспользовать `LaneToggle` на двух страницах, выношу его (и при
необходимости `Stat`) в отдельные компоненты — `LaneToggle` из `routes/lanes.tsx` в
`components/`, без изменения поведения.

## 6. Тестирование

- `lib/sort.test.ts` — компаратор: натуралка (`s2 < s10 < s100`), числа, булевы,
  `null/undefined` всегда внизу при обоих направлениях, кириллица.
- `hooks/useTableSort` — цикл toggle (asc→desc→asc, смена колонки), стабильность
  (тай-брейк), дефолт.
- Компонентные тесты в существующем стиле (vitest + testing-library, как
  `StatusBadge.test.tsx`): клик по `SortableDTh` меняет порядок строк; host-strip
  отдаёт натуральный порядок.
- Финальный прогон: `npm run typecheck`, `npm test`, `npm run build`.

## 7. Затрагиваемые файлы

**Новые:** `web/src/lib/sort.ts`, `web/src/lib/sort.test.ts`,
`web/src/hooks/useTableSort.ts` (+ тест), `web/src/components/LaneToggle.tsx`.

**Изменяемые:** `web/src/components/Table.tsx` (+`SortableDTh`),
`web/src/routes/dugdales.tsx`, `web/src/routes/lanes.tsx`, `web/src/routes/index.tsx`,
`web/src/routes/config.$host.tsx` (переписать).

**Не трогаем:** `MissionsTable.tsx`, `ExecTable.tsx`, весь `internal/` (Go).
