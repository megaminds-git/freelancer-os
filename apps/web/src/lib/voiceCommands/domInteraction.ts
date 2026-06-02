// DOM interaction utilities — lets ARIA click, fill, and read any visible
// UI element by natural description, without knowing element IDs in advance.

// ── Click ─────────────────────────────────────────────────────────────────────

/** Click a button, link, or interactive element whose visible text matches. */
export function clickByText(description: string, root: Element = document.body): boolean {
  const lc = description.toLowerCase().trim();
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a, [role="button"], [role="tab"], [role="menuitem"], [role="option"]'
    )
  );

  // 1. Exact text match
  const exact = candidates.find(
    (el) => el.textContent?.trim().toLowerCase() === lc
  );
  if (exact) { exact.click(); return true; }

  // 2. aria-label match
  const byAria = candidates.find(
    (el) =>
      el.getAttribute('aria-label')?.toLowerCase().includes(lc) ||
      el.getAttribute('title')?.toLowerCase().includes(lc)
  );
  if (byAria) { byAria.click(); return true; }

  // 3. Partial text match (prefer shorter elements to avoid giant containers)
  const partial = candidates
    .filter((el) => el.textContent?.trim().toLowerCase().includes(lc))
    .sort((a, b) => (a.textContent?.length ?? 999) - (b.textContent?.length ?? 999))[0];
  if (partial) { partial.click(); return true; }

  return false;
}

// ── Fill inputs ───────────────────────────────────────────────────────────────

/** Fill an input/textarea identified by its placeholder, aria-label, or associated label. */
export function fillInput(labelOrPlaceholder: string, value: string): boolean {
  const lc = labelOrPlaceholder.toLowerCase().trim();
  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled])'
    )
  );

  const match =
    inputs.find((i) => i.placeholder?.toLowerCase().includes(lc)) ||
    inputs.find((i) => i.getAttribute('aria-label')?.toLowerCase().includes(lc)) ||
    inputs.find((i) => {
      const id = i.id;
      if (!id) return false;
      const label = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      return label?.textContent?.toLowerCase().includes(lc);
    });

  if (match) {
    setNativeValue(match, value);
    return true;
  }
  return false;
}

// Triggers React's synthetic onChange by using the native value setter
function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ── Scroll ────────────────────────────────────────────────────────────────────

export function scrollPage(direction: 'up' | 'down', amount = 520) {
  const delta = direction === 'down' ? amount : -amount;
  // Try the primary content area first, fall back to window
  const main = document.querySelector<HTMLElement>('main.app-main-surface');
  if (main) {
    main.scrollBy({ top: delta, behavior: 'smooth' });
  } else {
    window.scrollBy({ top: delta, behavior: 'smooth' });
  }
}

// ── Read visible UI ───────────────────────────────────────────────────────────

/** Returns visible button labels — used to give the AI context about what's clickable. */
export function getVisibleButtons(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [role="button"]'
    )
  )
    .map((el) => el.textContent?.trim() ?? '')
    .filter((t) => t.length > 0 && t.length < 80)
    .slice(0, 24);
}

/** Reads text content of the main content area for context. */
export function getPageSummary(maxChars = 600): string {
  const main = document.querySelector('main') ?? document.body;
  const text = main.innerText ?? main.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}
