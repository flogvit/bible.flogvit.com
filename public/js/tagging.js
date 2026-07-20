// Øy: emne-tagging (port av bibel/src/components/ItemTagging.tsx +
// TopicsContext). Bygger UI-et inn i .item-tagging[data-item-type][data-item-id]
// fra src/views/item-tagging.tsx.
//
// Lagringsformat er identisk med gamle appen slik at data er kompatible:
// localStorage['bible-topics'] = { topics: [{id,name}],
//   verseTopics: [{bookId,chapter,verse,topicId}] (legacy),
//   itemTopics: [{itemType,itemId,topicId}] }
// Gamle appen speilet alltid til localStorage, så denne øya leser/skriver
// samme data. IndexedDB/synk-motoren er ikke portert.
// TODO(#12): sync-kobling

const STORAGE_KEY = 'bible-topics';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      topics: Array.isArray(data.topics) ? data.topics : [],
      verseTopics: Array.isArray(data.verseTopics) ? data.verseTopics : [],
      itemTopics: Array.isArray(data.itemTopics) ? data.itemTopics : [],
    };
  } catch {
    return { topics: [], verseTopics: [], itemTopics: [] };
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* full/utilgjengelig storage — ignorér */
  }
}

// Samme id-generator som gamle TopicsContext
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function getTopicsForItem(data, itemType, itemId) {
  const topicIds = data.itemTopics
    .filter((it) => it.itemType === itemType && it.itemId === itemId)
    .map((it) => it.topicId);
  return data.topics.filter((t) => topicIds.includes(t.id));
}

function addTopic(data, name) {
  const trimmed = name.trim();
  const existing = data.topics.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const topic = { id: generateId(), name: trimmed };
  data.topics.push(topic);
  return topic;
}

function addTopicToItem(data, itemType, itemId, topicId) {
  const exists = data.itemTopics.some(
    (it) => it.itemType === itemType && it.itemId === itemId && it.topicId === topicId,
  );
  if (!exists) data.itemTopics.push({ itemType, itemId, topicId });
  // Legacy-speiling for vers (som gamle addTopicToVerse)
  if (itemType === 'verse') {
    const parts = itemId.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      const [bookId, chapter, verse] = parts;
      const vExists = data.verseTopics.some(
        (vt) => vt.bookId === bookId && vt.chapter === chapter && vt.verse === verse && vt.topicId === topicId,
      );
      if (!vExists) data.verseTopics.push({ bookId, chapter, verse, topicId });
    }
  }
}

function removeTopicFromItem(data, itemType, itemId, topicId) {
  data.itemTopics = data.itemTopics.filter(
    (it) => !(it.itemType === itemType && it.itemId === itemId && it.topicId === topicId),
  );
  if (itemType === 'verse') {
    const parts = itemId.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      const [bookId, chapter, verse] = parts;
      data.verseTopics = data.verseTopics.filter(
        (vt) => !(vt.bookId === bookId && vt.chapter === chapter && vt.verse === verse && vt.topicId === topicId),
      );
    }
  }
}

function getSuggestions(data, itemType, itemId, input) {
  const existingIds = getTopicsForItem(data, itemType, itemId).map((t) => t.id);
  const q = input.trim().toLowerCase();
  const pool = q ? data.topics.filter((t) => t.name.toLowerCase().includes(q)) : data.topics;
  return pool.filter((t) => !existingIds.includes(t.id)).slice(0, 8);
}

// ── UI ──

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function initContainer(container) {
  const itemType = container.dataset.itemType;
  const itemId = container.dataset.itemId;
  if (!itemType || !itemId) return;
  const compact = container.classList.contains('compact');

  const body = el('div', 'tagging-body');
  const tagsList = el('div', 'tagging-tags');
  const inputWrapper = el('div', 'tagging-input-wrapper');
  const input = el('input', 'tagging-input');
  input.type = 'text';
  input.placeholder = 'Legg til emne...';
  const suggestionsBox = el('div', 'tagging-suggestions');
  suggestionsBox.hidden = true;
  inputWrapper.appendChild(input);
  inputWrapper.appendChild(suggestionsBox);
  body.appendChild(tagsList);
  body.appendChild(inputWrapper);

  let toggleBtn = null;
  if (compact) {
    toggleBtn = el('button', 'tagging-toggle');
    toggleBtn.type = 'button';
    body.classList.add('tagging-dropdown');
    body.hidden = true;
    container.appendChild(toggleBtn);
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      body.hidden = !body.hidden;
      if (!body.hidden) input.focus();
    });
  }
  container.appendChild(body);

  function renderToggle() {
    if (!toggleBtn) return;
    const count = getTopicsForItem(loadData(), itemType, itemId).length;
    toggleBtn.textContent = '';
    toggleBtn.appendChild(el('span', 'tagging-icon', '🏷'));
    if (count > 0) toggleBtn.appendChild(el('span', 'tagging-count', String(count)));
    toggleBtn.classList.toggle('has-tags', count > 0);
    toggleBtn.title = count > 0 ? `${count} emne${count > 1 ? 'r' : ''}` : 'Legg til emne';
  }

  function renderTags() {
    const data = loadData();
    const topics = getTopicsForItem(data, itemType, itemId);
    tagsList.textContent = '';
    tagsList.hidden = topics.length === 0;
    for (const topic of topics) {
      const tag = el('span', 'tagging-tag', topic.name);
      const remove = el('button', 'tagging-remove', '×');
      remove.type = 'button';
      remove.title = 'Fjern emne';
      remove.addEventListener('click', () => {
        const d = loadData();
        removeTopicFromItem(d, itemType, itemId, topic.id);
        saveData(d);
        render();
      });
      tag.appendChild(remove);
      tagsList.appendChild(tag);
    }
    renderToggle();
  }

  function commitAdd(existingTopic) {
    const value = input.value.trim();
    if (!value && !existingTopic) return;
    const data = loadData();
    const topic = existingTopic ? existingTopic : addTopic(data, value);
    addTopicToItem(data, itemType, itemId, topic.id);
    saveData(data);
    input.value = '';
    hideSuggestions();
    render();
  }

  function renderSuggestions() {
    const data = loadData();
    const suggestions = getSuggestions(data, itemType, itemId, input.value);
    const value = input.value.trim();
    suggestionsBox.textContent = '';
    const isNew = value && !data.topics.some((t) => t.name.toLowerCase() === value.toLowerCase());
    if (suggestions.length === 0 && !isNew) {
      suggestionsBox.hidden = true;
      return;
    }
    for (const topic of suggestions) {
      const item = el('div', 'tagging-suggestion', topic.name);
      // mousedown så valget skjer før input mister fokus
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commitAdd(topic);
      });
      suggestionsBox.appendChild(item);
    }
    if (isNew) {
      const item = el('div', 'tagging-suggestion', value);
      item.appendChild(el('span', 'tagging-new-label', '(nytt emne)'));
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commitAdd(null);
      });
      suggestionsBox.appendChild(item);
    }
    suggestionsBox.hidden = false;
  }

  function hideSuggestions() {
    suggestionsBox.hidden = true;
  }

  input.addEventListener('input', renderSuggestions);
  input.addEventListener('focus', renderSuggestions);
  input.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      const suggestions = getSuggestions(loadData(), itemType, itemId, input.value);
      commitAdd(suggestions.length > 0 ? suggestions[0] : null);
    } else if (e.key === 'Escape') {
      if (compact && toggleBtn) body.hidden = true;
      hideSuggestions();
    }
  });

  function render() {
    renderTags();
  }
  render();
}

for (const container of document.querySelectorAll('.item-tagging[data-item-type][data-item-id]')) {
  initContainer(container);
}
