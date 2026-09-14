import type ru from './messages/ru.json';

/**
 * **The dictionary's type, declared once, so the compiler checks every `t()` call site.**
 *
 * `use-intl` derives `Messages` from this interface and falls back to `Record<string, any>` when
 * nothing augments it — which is what this app had until now. With the fallback in place all 214
 * `t('…')` calls and both namespace arguments were unchecked: a key that was renamed, nested one
 * level differently or removed from `messages/ru.json` compiled, passed lint, passed the whole
 * suite, and appeared in front of a user as its own name.
 *
 * Every invariant this milestone holds is a property of a string *value* — is it Russian, is it
 * bound with U+00A0, does it match the approved contract — and no type system can state those; they
 * are held by `i18n/dictionary.test.ts` and `i18n/glossary.test.ts` instead. But the property that
 * *can* be stated — **this key exists** — belongs to the compiler, and a compiler-enforced
 * invariant is the one kind of guard whose green cannot be mistaken for a broken scan.
 *
 * `ru.json` is the source of the type because `i18n/request.ts` loads it and only it. `en.json` is
 * a fallback file with no route; `i18n/dictionary.test.ts` holds the two key sets equal, which is
 * what keeps that file from rotting behind this one.
 */
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof ru;
  }
}
