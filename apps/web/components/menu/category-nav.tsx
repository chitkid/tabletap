import type { MenuResponse } from '@tabletap/shared';

/**
 * In-page anchors rather than a client-side tab state: the section headings are the real
 * destinations, so the browser's own scrolling and the back button already do the work.
 */
export function CategoryNav({ categories }: { categories: MenuResponse['categories'] }) {
  return (
    <nav
      aria-label="Menu sections"
      className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur"
    >
      <ul className="flex gap-2">
        {categories.map((category) => (
          <li key={category.id}>
            <a
              href={`#category-${category.id}`}
              className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              {category.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
