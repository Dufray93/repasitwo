let itemsData = [];

const MODE_VERBS = "verbs";
const MODE_PHRASAL = "phrasal";
const MODE_KEY = "repasitwo.mode.v1";
const STORAGE_KEY_PREFIX = "repasitwo.practiceState";

let ALL_IDS = [];
let ITEM_BY_ID = new Map();
let TOTAL_ITEMS = 0;

const spanishTitle = document.getElementById("spanishVerb");
const modeSubtitle = document.getElementById("modeSubtitle");

const col1Head = document.getElementById("col1Head");
const col2Head = document.getElementById("col2Head");
const col3Head = document.getElementById("col3Head");
const col4Head = document.getElementById("col4Head");

const col1Cell = document.getElementById("col1Cell");
const col2Cell = document.getElementById("col2Cell");
const col3Cell = document.getElementById("col3Cell");
const col4Cell = document.getElementById("col4Cell");

const spanishCell = document.getElementById("spanishCell");
const presentCell = document.getElementById("presentCell");
const pastCell = document.getElementById("pastCell");
const participleCell = document.getElementById("participleCell");

const toggleButton = document.getElementById("toggleButton");
const progressLabel = document.getElementById("progressLabel");
const progressBar = document.getElementById("progressBar");
const activeCountBadge = document.getElementById("activeCountBadge");
const toast = document.getElementById("toast");
const verbImage = document.getElementById("verbImage");

const tabVerbs = document.getElementById("tabVerbs");
const tabPhrasal = document.getElementById("tabPhrasal");

const undoButton = document.querySelector('[data-action="undo"]');
const rememberButton = document.querySelector('[data-action="remember"]');
const nextButton = document.querySelector('[data-action="next"]');
const resetButton = document.querySelector('[data-action="reset"]');
const reloadButton = document.querySelector('[data-action="reload-data"]');

const speakPresentButton = document.querySelector('[data-action="speak-present"]');
const speakPastButton = document.querySelector('[data-action="speak-past"]');
const speakParticipleButton = document.querySelector('[data-action="speak-participle"]');
const speakButtons = [speakPresentButton, speakPastButton, speakParticipleButton].filter(Boolean);

const DEFAULT_VERB_IMAGE = "./src/assets/default.jpg";
const PLACEHOLDER = "???";
const SHEET_STATUS_ACTIVE = new Set(["a", "activo"]);

let toastTimer;
const speechSupported = "speechSynthesis" in window;
let speechVoice = null;
let speechSetup = false;

let activeMode = loadPreferredMode();
let state = null;
const sourceByMode = {
  [MODE_VERBS]: [],
  [MODE_PHRASAL]: [],
};

bootstrap();

async function bootstrap() {
  bindEvents();
  initSpeech();
  initImageFallback();

  await refreshAllData();
  switchMode(activeMode, { showToast: false });

  if (!sourceByMode[MODE_VERBS].length && !sourceByMode[MODE_PHRASAL].length) {
    showToast("No hay contenido activo disponible en este momento.");
  }
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action } = actionTarget.dataset;
    void handleAction(action);
  });

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case " ":
        event.preventDefault();
        handleNext();
        break;
      case "s":
        event.preventDefault();
        handleToggle();
        break;
      case "r":
        event.preventDefault();
        handleRemember();
        break;
      case "u":
        event.preventDefault();
        handleUndo();
        break;
      default:
        break;
    }
  });
}

async function handleAction(action) {
  switch (action) {
    case "toggle":
      handleToggle();
      break;
    case "next":
      handleNext();
      break;
    case "remember":
      handleRemember();
      break;
    case "undo":
      handleUndo();
      break;
    case "reset":
      handleReset(false);
      break;
    case "reset-all":
      handleReset(true);
      break;
    case "reload-data":
      await handleReloadData();
      break;
    case "set-mode-verbs":
      switchMode(MODE_VERBS, { showToast: true });
      break;
    case "set-mode-phrasal":
      switchMode(MODE_PHRASAL, { showToast: true });
      break;
    case "speak-present":
      handleSpeak("present");
      break;
    case "speak-past":
      handleSpeak("past");
      break;
    case "speak-participle":
      handleSpeak("participle");
      break;
    default:
      break;
  }
}

function switchMode(mode, { showToast = false } = {}) {
  const normalizedMode = mode === MODE_PHRASAL ? MODE_PHRASAL : MODE_VERBS;

  activeMode = normalizedMode;
  persistPreferredMode(normalizedMode);

  itemsData = sourceByMode[normalizedMode] || [];
  updateDataIndexes();
  state = loadState(normalizedMode);

  applyModePresentation();

  if (!TOTAL_ITEMS) {
    renderItem(null);
    updateProgress();
    updateButtons();
    updateActiveBadge();
    return;
  }

  if (state.remaining.length) {
    const candidate = selectInitialCurrent();
    setCurrentItem(candidate, { reveal: state.revealAnswers, persist: false });
  } else if (state.currentId !== null) {
    setCurrentItem(state.currentId, { reveal: true, persist: false });
  } else {
    renderItem(null);
  }

  updateProgress();
  updateButtons();
  updateActiveBadge();
  persistState();

  if (showToast) {
    const modeName = normalizedMode === MODE_VERBS ? "Verbos" : "Phrasal verbs";
    showToast(`${modeName}: ${TOTAL_ITEMS} activos.`);
  }
}

function applyModePresentation() {
  document.body.dataset.mode = activeMode;

  const verbsMode = activeMode === MODE_VERBS;

  if (tabVerbs) {
    tabVerbs.classList.toggle("is-active", verbsMode);
    tabVerbs.setAttribute("aria-selected", String(verbsMode));
  }

  if (tabPhrasal) {
    tabPhrasal.classList.toggle("is-active", !verbsMode);
    tabPhrasal.setAttribute("aria-selected", String(!verbsMode));
  }

  if (modeSubtitle) {
    modeSubtitle.textContent = verbsMode
      ? "Tarjetas de clase para presente, pasado y participio."
      : "Tarjetas de clase para practicar phrasal verbs.";
  }

  if (col1Head) col1Head.textContent = verbsMode ? "Verbo (ES)" : "Español";
  if (col2Head) col2Head.textContent = verbsMode ? "Presente" : "Inglés";
  if (col3Head) col3Head.textContent = "Pasado";
  if (col4Head) col4Head.textContent = "Participio";

  if (col1Cell) col1Cell.dataset.label = verbsMode ? "Verbo (ES)" : "Español";
  if (col2Cell) col2Cell.dataset.label = verbsMode ? "Presente" : "Inglés";
  if (col3Cell) col3Cell.dataset.label = "Pasado";
  if (col4Cell) col4Cell.dataset.label = "Participio";

  if (speakPresentButton) {
    speakPresentButton.setAttribute("aria-label", verbsMode ? "Escuchar presente" : "Escuchar inglés");
  }

  if (nextButton) {
    nextButton.textContent = verbsMode ? "Nuevo verbo" : "Nuevo phrasal";
  }

  if (toggleButton) {
    toggleButton.textContent = state?.revealAnswers ? "Ocultar respuestas" : "Mostrar respuestas";
  }
}

function updateDataIndexes() {
  ALL_IDS = itemsData.map((item) => item.id);
  ITEM_BY_ID = new Map(itemsData.map((item) => [item.id, item]));
  TOTAL_ITEMS = itemsData.length;
}

function defaultState() {
  return {
    remaining: [...ALL_IDS],
    learned: [],
    history: [],
    currentId: null,
    revealAnswers: false,
  };
}

function loadState(mode) {
  if (!TOTAL_ITEMS) {
    return defaultState();
  }

  try {
    const raw = localStorage.getItem(getStorageKey(mode));
    if (!raw) return defaultState();

    const parsed = JSON.parse(raw);
    const validIds = new Set(ALL_IDS);

    const sanitize = (maybeArray) =>
      Array.isArray(maybeArray)
        ? Array.from(new Set(maybeArray.filter((id) => validIds.has(id))))
        : [];

    const remainingRawIsArray = Array.isArray(parsed.remaining);
    const remaining = sanitize(parsed.remaining);
    const learned = sanitize(parsed.learned);
    const history = sanitize(parsed.history);
    const currentId = validIds.has(parsed.currentId) ? parsed.currentId : null;
    const revealAnswers = Boolean(parsed.revealAnswers);

    const filteredRemaining = remaining.filter((id) => !learned.includes(id));
    const learnedAll = learned.length === TOTAL_ITEMS;
    const corruptedData = !remainingRawIsArray || (filteredRemaining.length === 0 && !learnedAll);

    if (corruptedData) {
      return defaultState();
    }

    return {
      remaining: filteredRemaining,
      learned,
      history,
      currentId,
      revealAnswers,
    };
  } catch (error) {
    console.warn("No se pudo cargar el progreso guardado:", error);
    return defaultState();
  }
}

function persistState() {
  try {
    const payload = {
      remaining: state.remaining,
      learned: state.learned,
      history: state.history,
      currentId: state.currentId,
      revealAnswers: state.revealAnswers,
    };
    localStorage.setItem(getStorageKey(activeMode), JSON.stringify(payload));
  } catch (error) {
    console.warn("No se pudo guardar el progreso:", error);
  }
}

function getStorageKey(mode) {
  return `${STORAGE_KEY_PREFIX}.${mode}.v1`;
}

function clearAllStoredProgress() {
  [MODE_VERBS, MODE_PHRASAL].forEach((mode) => {
    try {
      localStorage.removeItem(getStorageKey(mode));
    } catch (error) {
      console.warn("No se pudo limpiar almacenamiento:", error);
    }
  });
}

function loadPreferredMode() {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === MODE_PHRASAL ? MODE_PHRASAL : MODE_VERBS;
  } catch {
    return MODE_VERBS;
  }
}

function persistPreferredMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch (error) {
    console.warn("No se pudo guardar el modo:", error);
  }
}

function selectInitialCurrent() {
  if (state.currentId !== null && state.remaining.includes(state.currentId)) {
    return state.currentId;
  }
  return pickRandomId(state.remaining);
}

function setCurrentItem(id, { reveal = false, persist = true } = {}) {
  state.currentId = id;
  state.revealAnswers = reveal && id !== null ? reveal : false;
  renderItem(id);
  updateButtons();
  if (persist) {
    persistState();
  }
}

function renderItem(id) {
  const item = id !== null ? ITEM_BY_ID.get(id) : null;
  const verbsMode = activeMode === MODE_VERBS;

  if (!item) {
    const completionTitle = verbsMode ? "¡Todos los verbos listos!" : "¡Todos los phrasal listos!";
    spanishTitle.textContent = state.learned.length === TOTAL_ITEMS && TOTAL_ITEMS > 0 ? completionTitle : "Selecciona una tarjeta";
    spanishCell.textContent = "—";
    presentCell.textContent = "—";
    pastCell.textContent = "—";
    participleCell.textContent = "—";
    updateVerbImage(null);
    toggleButton.textContent = "Mostrar respuestas";
    return;
  }

  if (verbsMode) {
    spanishTitle.textContent = item.spanish;
    spanishCell.textContent = item.spanish;
    presentCell.textContent = state.revealAnswers ? item.present : PLACEHOLDER;
    pastCell.textContent = state.revealAnswers ? item.past : PLACEHOLDER;
    participleCell.textContent = state.revealAnswers ? item.participle : PLACEHOLDER;
  } else {
    spanishTitle.textContent = item.english;
    spanishCell.textContent = item.spanish;
    presentCell.textContent = state.revealAnswers ? item.english : PLACEHOLDER;
    pastCell.textContent = "—";
    participleCell.textContent = "—";
  }

  updateVerbImage(item);
  toggleButton.textContent = state.revealAnswers ? "Ocultar respuestas" : "Mostrar respuestas";
}

function updateProgress() {
  const learnedCount = state.learned.length;
  const modeText = activeMode === MODE_VERBS ? "verbos" : "phrasal";
  progressLabel.textContent = `Aprendidos: ${learnedCount} de ${TOTAL_ITEMS} ${modeText} activos`;
  const percentage = TOTAL_ITEMS ? Math.round((learnedCount / TOTAL_ITEMS) * 100) : 0;
  progressBar.style.width = `${percentage}%`;
}

function updateActiveBadge() {
  if (!activeCountBadge) return;
  const label = activeMode === MODE_VERBS ? "Verbos activos" : "Phrasal activos";
  activeCountBadge.textContent = `${label}: ${TOTAL_ITEMS}`;
}

function updateButtons() {
  const hasCurrent = state.currentId !== null;
  const isPhrasalMode = activeMode === MODE_PHRASAL;

  if (toggleButton) {
    toggleButton.disabled = !hasCurrent;
  }

  if (rememberButton) {
    rememberButton.disabled = !hasCurrent || !state.remaining.includes(state.currentId);
  }

  if (undoButton) {
    undoButton.disabled = state.history.length === 0;
  }

  if (resetButton) {
    resetButton.disabled = state.learned.length === 0 && state.history.length === 0;
  }

  if (nextButton) {
    nextButton.disabled =
      !state.remaining.length || (state.remaining.length === 1 && state.remaining[0] === state.currentId);
  }

  speakButtons.forEach((button) => {
    if (!button) return;

    const action = button.dataset.action;
    const isMainSpeech = action === "speak-present";
    const allowedInMode = isPhrasalMode ? isMainSpeech : true;
    const disabled = !speechSupported || !hasCurrent || !allowedInMode;

    button.disabled = disabled;

    if (!speechSupported) {
      button.title = "Tu navegador no soporta audio todavía.";
    } else if (disabled) {
      button.removeAttribute("title");
    } else {
      button.title = "Reproducir pronunciación";
    }
  });
}

function handleToggle() {
  if (state.currentId === null) return;
  state.revealAnswers = !state.revealAnswers;
  renderItem(state.currentId);
  updateButtons();
  persistState();
}

function handleNext() {
  if (!state.remaining.length) {
    showToast("Ya repasaste toda la lista. Reinicia cuando quieras.");
    return;
  }

  if (state.remaining.length === 1 && state.remaining[0] === state.currentId) {
    showToast("Esta es la última tarjeta pendiente.");
    return;
  }

  const nextId = pickRandomId(excludeCurrentPool());
  setCurrentItem(nextId, { reveal: false });
}

function handleRemember() {
  if (state.currentId === null) return;
  const { currentId } = state;

  if (!state.remaining.includes(currentId)) {
    showToast("Esa tarjeta ya estaba marcada como recordada.");
    return;
  }

  state.remaining = state.remaining.filter((id) => id !== currentId);
  if (!state.learned.includes(currentId)) {
    state.learned.push(currentId);
  }
  state.history.push(currentId);

  updateProgress();
  persistState();
  showToast("¡Bien hecho! Tarjeta recordada.");

  if (state.remaining.length) {
    const nextId = pickRandomId(state.remaining);
    setCurrentItem(nextId, { reveal: false });
  } else {
    setCurrentItem(null, { reveal: true });
  }
}

function handleUndo() {
  if (!state.history.length) {
    showToast("Nada que deshacer todavía.");
    return;
  }

  const lastId = state.history.pop();
  state.learned = state.learned.filter((id) => id !== lastId);
  if (!state.remaining.includes(lastId)) {
    state.remaining.push(lastId);
  }

  setCurrentItem(lastId, { reveal: true });
  updateProgress();
  persistState();
  showToast("Última tarjeta restaurada.");
}

function handleReset(resetStorage) {
  if (!TOTAL_ITEMS) {
    showToast("No hay tarjetas para reiniciar.");
    return;
  }

  if (resetStorage) {
    clearAllStoredProgress();
  }

  state = defaultState();
  const nextId = pickRandomId(state.remaining);
  setCurrentItem(nextId, { reveal: false, persist: false });
  updateProgress();
  updateActiveBadge();
  persistState();

  showToast(resetStorage ? "Progreso de todas las secciones eliminado." : "Lista reiniciada.");
}

async function handleReloadData() {
  setReloadButtonLoading(true);

  try {
    await refreshAllData();
    switchMode(activeMode, { showToast: false });

    const modeName = activeMode === MODE_VERBS ? "verbos" : "phrasal verbs";
    showToast(`Lista de ${modeName} actualizada: ${TOTAL_ITEMS} activos.`);
  } finally {
    setReloadButtonLoading(false);
  }
}

async function refreshAllData() {
  const [verbs, phrasal] = await Promise.all([
    loadItemsFromSource(MODE_VERBS),
    loadItemsFromSource(MODE_PHRASAL),
  ]);

  sourceByMode[MODE_VERBS] = verbs;
  sourceByMode[MODE_PHRASAL] = phrasal;
}

function setReloadButtonLoading(isLoading) {
  if (!reloadButton) return;
  reloadButton.disabled = isLoading;
  reloadButton.textContent = isLoading ? "Actualizando..." : "Actualizar clase";
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 280);
  }, 2200);
}

function excludeCurrentPool() {
  if (state.currentId === null) return [...state.remaining];
  const pool = state.remaining.filter((id) => id !== state.currentId);
  return pool.length ? pool : [...state.remaining];
}

function pickRandomId(pool) {
  if (!pool.length) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function initImageFallback() {
  if (!verbImage) return;
  verbImage.addEventListener(
    "error",
    () => {
      if (verbImage.dataset.defaultApplied === "true") return;
      verbImage.dataset.defaultApplied = "true";
      verbImage.src = DEFAULT_VERB_IMAGE;
    },
    { passive: true }
  );
}

function updateVerbImage(item) {
  if (!verbImage) return;

  const newSrc = item && item.image ? item.image : DEFAULT_VERB_IMAGE;
  const previous = verbImage.dataset.currentSrc;

  verbImage.dataset.defaultApplied = String(newSrc === DEFAULT_VERB_IMAGE);

  const altText = !item
    ? "Ilustración representativa"
    : activeMode === MODE_VERBS
      ? `Ilustración del verbo ${item.present}`
      : `Ilustración del phrasal ${item.english}`;

  verbImage.alt = altText;

  if (previous === newSrc) return;

  verbImage.dataset.currentSrc = newSrc;
  verbImage.src = newSrc;
}

function initSpeech() {
  if (speechSetup) return;
  speechSetup = true;

  if (!speechSupported) return;

  const synth = window.speechSynthesis;

  const selectVoice = () => {
    const voices = synth.getVoices();
    if (!voices.length) return;

    const preferredLangs = ["en-US", "en-GB", "en-AU", "en-CA", "en-IN", "en"].map((code) => code.toLowerCase());
    const lower = (value) => value?.toLowerCase?.() ?? "";

    const byExactMatch = preferredLangs
      .map((code) => voices.find((voice) => lower(voice.lang) === code))
      .find(Boolean);

    const byPrefix = voices.find((voice) => lower(voice.lang).startsWith("en"));

    speechVoice = byExactMatch || byPrefix || voices[0] || null;
  };

  selectVoice();

  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", selectVoice, { once: true });
  } else if ("onvoiceschanged" in synth) {
    synth.onvoiceschanged = selectVoice;
  }
}

function handleSpeak(form) {
  if (!speechSupported) {
    showToast("Tu navegador no soporta el audio aún.");
    return;
  }

  const item = state.currentId !== null ? ITEM_BY_ID.get(state.currentId) : null;
  if (!item) {
    showToast("Primero selecciona una tarjeta.");
    return;
  }

  if (activeMode === MODE_PHRASAL && form !== "present") {
    return;
  }

  const text = activeMode === MODE_PHRASAL ? item.english : item[form];
  if (!text) {
    showToast("No hay audio disponible.");
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(String(text).replace(/\//g, " or "));
  utterance.rate = 0.95;
  utterance.pitch = 1;

  if (speechVoice) {
    utterance.voice = speechVoice;
    utterance.lang = speechVoice.lang;
  } else {
    utterance.lang = "en-US";
  }

  synth.speak(utterance);
}

async function loadItemsFromSource(mode) {
  const fallbackItems = mode === MODE_VERBS ? normalizeLocalVerbs(window.verbsData || []) : [];

  const config = window.VERB_SHEET_CONFIG || {};
  const configuredUrl = buildSheetDataUrl(getModeSourceUrl(mode, config));

  if (!configuredUrl) {
    return fallbackItems;
  }

  try {
    const response = await fetch(configuredUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const payloadText = await response.text();
    const parsedItems = parseItemsPayload(payloadText, mode);

    if (!parsedItems.length) {
      throw new Error("La hoja no tiene filas activas validas.");
    }

    return parsedItems;
  } catch (error) {
    console.warn(`No se pudo cargar la hoja de ${mode}. Se usará el respaldo.`, error);
    return fallbackItems;
  }
}

function getModeSourceUrl(mode, config) {
  if (mode === MODE_VERBS) {
    return config.verbsUrl ?? config.dataUrl ?? config.csvUrl ?? "";
  }
  return config.phrasalUrl ?? "";
}

function normalizeLocalVerbs(rawVerbs) {
  const rows = Array.isArray(rawVerbs) ? rawVerbs : [];
  return rows
    .map((item, index) => normalizeItemFromRecord(normalizeRecordKeys(item), index, MODE_VERBS, false))
    .filter(Boolean);
}

function buildSheetDataUrl(rawCandidate) {
  const rawUrl = typeof rawCandidate === "string" ? rawCandidate.trim() : "";
  if (!rawUrl) {
    return "";
  }

  if (rawUrl.includes("opensheet.elk.sh")) {
    return rawUrl;
  }

  if (rawUrl.includes("/pubhtml")) {
    return rawUrl.replace("/pubhtml", "/pub?output=csv");
  }

  if (rawUrl.includes("/pub?")) {
    return rawUrl.includes("output=csv") ? rawUrl : `${rawUrl}&output=csv`;
  }

  return rawUrl;
}

function parseItemsPayload(payloadText, mode) {
  const trimmed = payloadText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return parseItemsJson(parsed, mode);
    } catch (error) {
      console.warn("No se pudo interpretar respuesta JSON de la hoja.", error);
      return [];
    }
  }

  return parseItemsCsv(payloadText, mode);
}

function parseItemsJson(jsonData, mode) {
  const rows = Array.isArray(jsonData) ? jsonData : [];
  const items = rows
    .map((row, index) => normalizeItemFromRecord(normalizeRecordKeys(row), index, mode, true))
    .filter(Boolean);

  return dedupeItemIds(items);
}

function parseItemsCsv(csvText, mode) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((cell) => normalizeHeader(cell));

  const items = dataRows
    .map((row, index) => {
      const record = headers.reduce((acc, key, colIndex) => {
        if (!key) return acc;
        acc[key] = (row[colIndex] ?? "").trim();
        return acc;
      }, {});

      return normalizeItemFromRecord(record, index, mode, true);
    })
    .filter(Boolean);

  return dedupeItemIds(items);
}

function normalizeItemFromRecord(record, index, mode, respectStatus) {
  const status = getRecordValue(record, ["estado", "status"]);
  if (respectStatus && !isActiveStatus(status)) {
    return null;
  }

  if (mode === MODE_VERBS) {
    const spanish = getRecordValue(record, ["espanol", "spanish"]);
    const present = getRecordValue(record, ["presente", "present"]);
    const past = getRecordValue(record, ["pasado", "past"]);
    const participle = getRecordValue(record, ["participio", "participle"]);

    if (!spanish || !present || !past || !participle) {
      return null;
    }

    return {
      id: resolveItemId(record, index),
      spanish,
      present,
      past,
      participle,
      image: resolveImagePath(getRecordValue(record, ["imagen", "image"])),
    };
  }

  const spanish = getRecordValue(record, ["espanol", "spanish"]);
  const english = getRecordValue(record, ["ingles", "english", "phrasal", "phrasalverb", "phrasal_verb"]);

  if (!spanish || !english) {
    return null;
  }

  return {
    id: resolveItemId(record, index),
    spanish,
    english,
    image: resolveImagePath(getRecordValue(record, ["imagen", "image"])),
  };
}

function resolveItemId(record, index) {
  const rawId = getRecordValue(record, ["id"]);
  const parsedId = Number.parseInt(rawId, 10);
  return Number.isFinite(parsedId) ? parsedId : index;
}

function normalizeRecordKeys(record) {
  const source = record && typeof record === "object" ? record : {};

  return Object.entries(source).reduce((acc, [key, value]) => {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) return acc;
    acc[normalizedKey] = value;
    return acc;
  }, {});
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isActiveStatus(status) {
  if (!status) return false;
  const normalized = normalizeHeader(status).replace(/\s+/g, "");
  return SHEET_STATUS_ACTIVE.has(normalized);
}

function resolveImagePath(rawValue) {
  if (!rawValue) return "";

  const imageValue = String(rawValue).trim();
  if (!imageValue) return "";

  if (isLikelyUrl(imageValue)) {
    return imageValue;
  }

  const sanitizedName = imageValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  if (!sanitizedName) return "";

  const hasExtension = /\.[a-zA-Z0-9]+$/.test(sanitizedName);
  const fileName = hasExtension ? sanitizedName : `${sanitizedName}.jpg`;
  return `./src/assets/${fileName}`;
}

function getRecordValue(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;

    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function dedupeItemIds(items) {
  const used = new Set();

  return items.map((item) => {
    let nextId = item.id;
    while (used.has(nextId)) {
      nextId += 1;
    }
    used.add(nextId);
    return { ...item, id: nextId };
  });
}

function isLikelyUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(value);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }

      row.push(cell);
      if (row.some((entry) => String(entry).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((entry) => String(entry).trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
