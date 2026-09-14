# Phase 2.5 — Russian copy, glossary and editorial rules

Date: 2026-09-14. Status: **awaiting the owner's approval of the glossary and the landing copy.**
Nothing has been extracted into dictionaries yet — that comes after this file is approved, because
five hundred strings translated against a glossary that then changes is five hundred strings
translated twice.

## The status glossary, and where the brief and the product disagree

The commissioning brief lists six statuses: `new`, `accepted`, `cooking`, `ready`, `served`,
`cancelled`. **Two of them do not exist in this product and one that does exist is missing from the
brief.** The real state machine is `packages/shared/src/orders.ts`:

```
draft → placed → paid → cooking → ready → served        cancelled (from placed or paid)
```

Three facts about it that the translation has to respect:

- **`paid` is set by the payment webhook, never by staff** (`TRANSITION_RIGHTS`). There is no
  "a cook accepted the order" step: the board goes from paid straight to cooking.
- **`placed` means placed and not yet paid.** It is the guest's business, and the kitchen board does
  not draw it at all (`ACTIVE_ORDER_STATUSES` is what is open, not what is on screen).
- **`draft` is a basket that has not been sent.** The guest never sees it as a status word.

So the brief's `new` maps onto the product's `paid` — the moment the order reaches the board — and
the brief's `accepted` maps onto nothing. Inventing it would mean adding a domain state, a
transition, rights for it and tests: a product change wearing a translation's clothes. It is not
done here, and if the acceptance step is actually wanted it belongs in its own milestone.

### The glossary, for the seven statuses that exist

| key         | Гость                      | Кухня и админка | Why the two differ                                         |
| ----------- | -------------------------- | --------------- | ---------------------------------------------------------- |
| `draft`     | — (не показывается словом) | Черновик        | Для гостя это ещё корзина, а не заказ                      |
| `placed`    | Ожидает оплаты             | — (не на доске) | Деньги — забота гостя; кухня заказ ещё не видит            |
| `paid`      | Отправлен на кухню         | Новый           | Одно событие с двух сторон: гость отпустил, кухня получила |
| `cooking`   | Готовится                  | Готовится       | Одно слово с обеих сторон: происходит ровно одно и то же   |
| `ready`     | Готов — сейчас принесут    | Готов           | Гостю важно, что дальше; кухне важно, что сделано          |
| `served`    | Подан                      | Подан           |                                                            |
| `cancelled` | Отменён                    | Отменён         |                                                            |

The rule behind the two columns: **the guest is told what happens to them, the staff is told what
the order is.** Where those coincide the wording coincides too, and «Готовится» being identical on
three surfaces is the point rather than an oversight.

## Terminology

| Термин             | Не                     |
| ------------------ | ---------------------- |
| тикет              | билет, талон           |
| доска заказов      | канбан, борд           |
| стол (стол 7)      | таблица, столик        |
| QR-код             | QR код, куар           |
| заметка к заказу   | комментарий, пожелание |
| час пик            | наплыв, rush           |
| смена              | сессия                 |
| позиция (в заказе) | айтем, товар           |

Technology names are not translated: Next.js, Fastify, Drizzle, Postgres, Playwright, Docker
Compose. The section that lists them is **«На чём построено»**.

## Editorial rules

- To the guest and to staff alike — on «вы», lowercase. Shorter and more direct for staff.
- Buttons are verbs in the infinitive: «Оформить заказ», «Открыть кухню», «Добавить блюдо». Never a
  noun: not «Заказ», not «Кухня».
- The verb on the button is the verb in the result: «Оформить заказ» → «Заказ оформлен».
- Errors say what happened and what to do. They do not apologise and they are never vague.
- «Ёлочки» for quotes, «—» for dashes, «ё» is used. Non-breaking spaces before short prepositions
  and inside «стол 7», «12 заказов», «1 250 ₽».
- Empty states are an invitation, not a statement of absence.

## Money

One helper, `formatPrice(cents)`, built on
`Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 })`,
giving **«1 250 ₽»** — symbol after the number, non-breaking thin space as the thousands separator,
no kopecks in the menu. Amounts stay integer kopecks in the database, exactly as they are cents
today; this is a formatting change and a seed change, not a schema change.

`apps/web/lib/money.ts:10` currently hardcodes `'en-US'`, and the restaurant's `currency` column
defaults to `'USD'`. Both change; the column stays, because it is per-restaurant and that is right.

Demo prices are rewritten as plausible Russian café prices rather than converted: coffee 250–350 ₽,
salads 450–650 ₽, mains 700–1 200 ₽.

## Plurals

Through ICU, never through `if`. The two hand-written binary plurals found in the audit —
`basket-bar.tsx:36` (`count === 1 ? 'item' : 'items'`) and `week-bars.tsx:27` — are the exact places
Russian breaks: «1 заказ», «2 заказа», «5 заказов» needs three forms and English needs two.

## The landing, in full

**Superseded on 2026-09-14 by the owner's instruction that the site must read as a real
restaurant's, not as a demonstration of a project.** What follows is the approved version; the
earlier draft — three role cards, the demo notices, the rush control and a technology list — is
gone, and the reasons are recorded under «Что убрано» below so the removal does not read as an
oversight.

**`<title>`** — «Little Furnace — заказ со стола по QR-коду»

The product's name is not in the title any more. A restaurant's page is titled with the
restaurant's name; TableTap is what the place runs on, and the repository is where that is
explained.

**Description** — «Отсканируйте код на столе, выберите блюда и оформите заказ. Кухня получает его
сразу, ждать официанта не нужно.»

**Header.** The restaurant's name on the left, «Вход для сотрудников» on the right.

**Hero.**

> ## Заказ со стола.
>
> ## Через секунду он на кухне.

The owner's draft read «Кухня видит его в тот же момент». «В тот же момент» is an abstraction and
«через секунду» is a measurement, and this product has the measurement — 34 ms from payment to the
board. Subtitle:

> Отсканируйте код на столе, выберите блюда и оформите заказ. Ждать официанта не нужно — кухня
> получает заказ сразу.

**The guest's one action** — a single button, «Открыть меню стола 7».

**«Как это работает»** — the one place numbering is earned, because the content is a sequence:

1. Отсканируйте QR-код на столе
2. Выберите блюда и добавьте заметку
3. Оформите заказ
4. Следите за статусом на телефоне

**«Часы работы»** — понедельник–четверг 12:00 — 23:00, пятница и суббота 12:00 — 01:00,
воскресенье 12:00 — 22:00.

**The back of house.** A band at the foot of the page, inverted — dark ground, light text — under
the heading «Служебная зона», with the line «Для сотрудников зала и кухни. Вход по учётной записи.»
and two controls: «Доска кухни» and «Панель администратора».

The inversion is the only one on the page and it is where inversion means something: the front of
house and the back of house are separated on screen the way they are separated in the building. The
owner asked for a **visible** staff entrance, so it is a band and a header link rather than a
footnote.

## Что убрано, и что с этим делать

Everything that gave the demonstration away is gone: the demo-mode notice, the reset notice, the
cold-start notice, «Устроить час пик» and its caption, the technology list, the repository link and
the three role cards.

**Two of those described real behaviour, and deleting the words does not delete the behaviour.**
They are replaced by explanations at the moment they apply, which is the honest form:

- **The hourly reset.** No banner. When an order is gone, its own screen says so: «Этот заказ больше
  не активен. Отсканируйте код на столе, чтобы начать заново.» The guest reads it once, when it is
  true, instead of being warned in advance about something that may never happen to them.
- **The cold start.** No warning. A loading state that reserves its space and does not pretend to be
  instant. No promise the product does not keep.

## What is not settled here

The four surfaces' own strings — menu, basket, checkout, receipt, board, admin — are extracted after
this file is approved. The count is roughly 500; the glossary above is what they will be translated
against.
