// Family recipes: search, categories, details, add and edit. The recipes are
// only read when the page is opened for the first time.
import {
  db, collection, doc, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from './firebase.js';
import { $, el, toast, card, emptyNote, addButton } from './ui.js';
import { t, locale } from './i18n.js';
import { canEdit, createdFields } from './family-data.js';
import { openForm, openDialog } from './dialog.js';

export const CATEGORIES = ['main', 'starter', 'dessert', 'baking', 'breakfast', 'drink', 'other'];
const fold = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function createRecipes(data) {
  const root = $('recipes-content');
  const session = data.session;
  let recipes = [];
  let loaded = false;
  let unsubscribe = null;
  let category = 'all';
  let search = '';

  function start() {
    if (unsubscribe) return;
    unsubscribe = onSnapshot(query(collection(db, 'recipes'), orderBy('title')), (snap) => {
      recipes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded = true;
      render();
    }, (err) => console.warn('Reading recipes failed', err.code));
  }

  // ---------- drawing (search field built once, list redrawn) ----------

  const searchInput = el('input', { class: 'search-input', type: 'search', placeholder: t('recipes.search'), 'aria-label': t('recipes.search'), autocomplete: 'off' });
  searchInput.addEventListener('input', () => { search = fold(searchInput.value.trim()); render(); });
  const chipBox = el('div', { class: 'chips', role: 'group', 'aria-label': t('recipes.category') });
  const listBox = el('div');
  root.replaceChildren(card(t('nav.recipes'), [searchInput, chipBox, listBox], { action: addButton(t('recipes.add'), () => openEditor(null)) }));

  function chips() {
    const used = new Set(recipes.map((r) => r.category));
    const options = ['all', ...CATEGORIES.filter((c) => used.has(c))];
    return options.map((c) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': category === c ? 'true' : 'false',
      text: c === 'all' ? t('recipes.all') : t(`recipes.cat.${c}`),
      onclick: () => { category = c; render(); },
    }));
  }

  function render() {
    chipBox.replaceChildren(...(recipes.length ? chips() : []));
    const list = recipes
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !search || fold(`${r.title} ${r.ingredients} ${r.source}`).includes(search))
      .sort((a, b) => String(a.title).localeCompare(String(b.title), locale));
    if (!list.length) {
      listBox.replaceChildren(emptyNote(!loaded ? t('common.loading') : recipes.length ? t('recipes.noMatch') : t('recipes.none')));
      return;
    }
    listBox.replaceChildren(el('ul', { class: 'recipe-list' }, list.map((r) => el('li', {}, [
      el('button', { class: 'recipe', type: 'button', onclick: () => openRecipe(r) }, [
        el('span', { class: 'recipe-title', text: r.title }),
        el('span', { class: 'recipe-meta', text: [t(`recipes.cat.${r.category}`), r.duration, r.servings].filter(Boolean).join(' · ') }),
      ]),
    ]))));
  }

  // ---------- details and editing ----------

  function openRecipe(r) {
    const ingredients = String(r.ingredients || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const content = [
      el('p', { class: 'muted small', text: [t(`recipes.cat.${r.category}`), r.duration, r.servings].filter(Boolean).join(' · ') }),
    ];
    if (ingredients.length) {
      content.push(el('h3', { class: 'detail-head', text: t('recipes.ingredients') }));
      content.push(el('ul', { class: 'ingredients' }, ingredients.map((line) => el('li', { text: line }))));
    }
    if (r.steps) {
      content.push(el('h3', { class: 'detail-head', text: t('recipes.steps') }));
      content.push(el('p', { class: 'pre', text: r.steps }));
    }
    if (r.source) content.push(el('p', { class: 'small', text: t('recipes.sourceIs', { source: r.source }) }));
    content.push(el('p', { class: 'muted small', text: t('common.addedBy', { name: r.createdByName || '?' }) }));
    const buttons = canEdit(session, r) ? [{ label: t('common.edit'), onClick: (close) => { close(); openEditor(r); } }] : [];
    openDialog({ title: r.title, content, buttons });
  }

  function openEditor(existing) {
    const r = existing || {};
    openForm({
      title: existing ? t('recipes.editTitle') : t('recipes.newTitle'),
      fields: [
        { name: 'title', type: 'text', label: t('recipes.titleLabel'), value: r.title || '', maxlength: 100, required: true },
        { name: 'category', type: 'select', label: t('recipes.category'), value: r.category || 'main', options: CATEGORIES.map((c) => ({ value: c, label: t(`recipes.cat.${c}`) })) },
        { name: 'duration', type: 'text', label: t('recipes.duration'), value: r.duration || '', maxlength: 30, placeholder: t('recipes.durationExample') },
        { name: 'servings', type: 'text', label: t('recipes.servings'), value: r.servings || '', maxlength: 30, placeholder: t('recipes.servingsExample') },
        { name: 'ingredients', type: 'textarea', label: t('recipes.ingredients'), value: r.ingredients || '', maxlength: 4000, rows: 6, hint: t('recipes.ingredientsHint') },
        { name: 'steps', type: 'textarea', label: t('recipes.steps'), value: r.steps || '', maxlength: 8000, rows: 8 },
        { name: 'source', type: 'text', label: t('recipes.source'), value: r.source || '', maxlength: 200, placeholder: t('recipes.sourceExample') },
      ],
      danger: existing ? { label: t('common.delete'), onClick: () => remove(existing) } : null,
      onSubmit: async (v) => {
        const recipe = {
          title: v.title.trim(),
          category: CATEGORIES.includes(v.category) ? v.category : 'other',
          duration: v.duration.trim(),
          servings: v.servings.trim(),
          ingredients: v.ingredients.trim(),
          steps: v.steps.trim(),
          source: v.source.trim(),
          updatedAt: serverTimestamp(),
        };
        try {
          if (existing) await updateDoc(doc(db, 'recipes', existing.id), recipe);
          else await addDoc(collection(db, 'recipes'), { ...recipe, ...createdFields(session) });
          toast(t('common.saved'));
          return undefined;
        } catch (err) {
          console.warn('Saving the recipe failed', err.code);
          return t('common.saveFailed');
        }
      },
    });
  }

  async function remove(existing) {
    if (!confirm(t('recipes.confirmDelete', { title: existing.title }))) return false;
    try {
      await deleteDoc(doc(db, 'recipes', existing.id));
      toast(t('common.deleted'));
      return true;
    } catch (err) {
      console.warn('Deleting the recipe failed', err.code);
      toast(t('common.saveFailed'));
      return false;
    }
  }

  render();
  return {
    onShow() { start(); },
    stop() { if (unsubscribe) unsubscribe(); root.replaceChildren(); },
  };
}
