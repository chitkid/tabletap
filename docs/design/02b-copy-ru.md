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

Working from the owner's draft, with the changes noted.

**`apps/web/messages/ru.json` is the authoritative artifact for typography, not this file.** It
carries the non-breaking spaces (U+00A0) this section describes below — before short prepositions
and conjunctions (на, в, с, и, от, по, без, под, со, как, или…) and between a number and its noun
(«стол 7», «60 минут») — and this file has been updated to match it, so the two agree rather than
quietly diverging. If they ever disagree again, the dictionary wins; fix this file to match it, not
the other way round.

**`<title>`** — «TableTap — заказ по QR-коду и живая доска заказов на кухне»

**Description** — «Гость сканирует код на столе, выбирает блюда и оформляет заказ. Кухня видит его
в тот же момент. Демо открыто, без регистрации.»

**Hero.** The owner's line is kept almost intact; it is already the thesis, and the direction's
display face is set in uppercase, so it is written to survive that:

> ## Заказ со стола.
>
> ## Через секунду он на кухне.

The draft's «Кухня видит его в тот же момент» is the more literal sentence and the weaker one — «в
тот же момент» is an abstraction, «через секунду» is a measurement, and this product has the
measurement: 34 мс от оплаты до доски. The subtitle carries it:

> Гость нажимает — тикет печатается на кухне. Ниже это можно сделать самому.

**Role cards.**

| Карточка | Текст                                                                                  | Кнопка                   |
| -------- | -------------------------------------------------------------------------------------- | ------------------------ |
| Гость    | Отсканируйте код телефоном или откройте стол 7 прямо здесь.                            | Открыть стол 7 как гость |
| Кухня    | Тикеты появляются в момент заказа. Откроется живая доска под учётной записью повара.   | Открыть доску кухни      |
| Админ    | Меню, столы, QR-коды и итоги дня. Откроется панель под учётной записью администратора. | Открыть панель админа    |

Changed from the draft: «сотрудника кухни» → «повара» (shorter, and it is a person rather than a
role title); «итоги дня» kept over «отчёт» because the admin screen is a day, not a report.

**Notices.**

- «Оплата в демо-режиме: без карты и без денег.»
- «Демо-данные сбрасываются каждые 60 минут.»
- «На бесплатном тарифе кухня засыпает, когда никого нет, поэтому первая страница после затишья
  может открываться до минуты.» — this line already exists in English and is measured (34 s cold,
  0.6 s warm); the Russian keeps the measurement rather than softening it.

**Час пик.** Button «Устроить час пик», under it «Двенадцать заказов за минуту, чтобы доске было чем
заняться.»

**«Как это работает»** — the one place numbering is earned, because the content is a sequence:

1. Отсканируйте QR-код на столе
2. Выберите блюда и добавьте заметку
3. Оформите заказ
4. Следите за статусом на телефоне

**Footer** — «Исходный код, решения и разбор проекта — в README репозитория.»

## What is not settled here

The four surfaces' own strings — menu, basket, checkout, receipt, board, admin — are extracted after
this file is approved. The count is roughly 500; the glossary above is what they will be translated
against.
