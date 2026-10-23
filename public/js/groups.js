// Households in the pages: the filter chips (all, whole family, each
// household), the "for" field in forms, and the small household badge.
// Nothing is shown while this person is in no household.
import { el } from './ui.js';
import { t } from './i18n.js';

export const ALL = '*';

/** true if an item belongs to the chosen filter ('*' all, '' whole family, or a household id). */
export const inGroup = (item, filter) => filter === ALL || (item.household || '') === filter;

/** Filter chips, or null when this person is in no household. */
export function groupChips(data, current, onChange) {
  const households = data.myHouseholds();
  if (!households.length) return null;
  const options = [[ALL, t('house.all')], ['', t('house.family')], ...households.map((h) => [h.id, h.name])];
  return el('div', { class: 'chips', role: 'group', 'aria-label': t('house.filter') }, options.map(([value, label]) => el('button', {
    class: 'chip', type: 'button', 'aria-pressed': current === value ? 'true' : 'false', text: label,
    onclick: () => onChange(value),
  })));
}

/** Form field "For whom?" (whole family or a household), or null when not in any household. */
export function groupField(data, value = '', { locked = false } = {}) {
  const households = data.myHouseholds();
  if (!households.length) return null;
  return {
    name: 'household', type: 'select', label: t('house.forLabel'), value: value || '',
    options: [{ value: '', label: t('house.family') }, ...households.map((h) => ({ value: h.id, label: h.name }))],
    hint: locked ? t('house.lockedHint') : t('house.forHint'),
  };
}

/** The default group for a new entry: the chosen filter if it is a household, else the whole family. */
export const defaultGroup = (data, filter) => (filter !== ALL && filter && data.myHouseholds().some((h) => h.id === filter) ? filter : '');

/** Small badge with the household name, or null for whole family entries. */
export function groupBadge(data, item) {
  if (!item.household) return null;
  const name = data.householdName(item.household);
  return name ? el('span', { class: 'house-badge', text: name }) : null;
}
