const verbsData = window.verbsData || [];

const STORAGE_KEY = "verbPracticeState.v1";
const ALL_IDS = verbsData.map((verb) => verb.id);
const VERB_BY_ID = new Map(verbsData.map((verb) => [verb.id, verb]));
const TOTAL_VERBS = verbsData.length;

const spanishTitle = document.getElementById("spanishVerb");
const spanishCell = document.getElementById("spanishCell");
const presentCell = document.getElementById("presentCell");
const pastCell = document.getElementById("pastCell");
const participleCell = document.getElementById("participleCell");
const toggleButton = document.getElementById("toggleButton");
const progressLabel = document.getElementById("progressLabel");
const progressBar = document.getElementById("progressBar");
const toast = document.getElementById("toast");

const PLACEHOLDER = "???";
let toastTimer;
const speechSupported = "speechSynthesis" in window;
let speechVoice = null;
let speechSetup = false;

const defaultState = () => ({
  remaining: [...ALL_IDS],
  learned: [],
  history: [],
  currentId: null,
  revealAnswers: false,
});

let state = loadState();

init();

function init() {
  bindEvents();
  initSpeech();
  if (state.remaining.length) {
    const candidate = selectInitialCurrent();
    setCurrentVerb(candidate, { reveal: state.revealAnswers, persist: false });
  } else if (state.currentId !== null) {
    // Allow showing the last studied verb even if se completó la lista.
    setCurrentVerb(state.currentId, { reveal: true, persist: false });
  } else {
    renderVerb(null);
  }
  updateProgress();
  updateButtons();
  persistState();
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action } = actionTarget.dataset;
    handleAction(action);
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

function handleAction(action) {
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

function handleToggle() {
  if (state.currentId === null) return;
  state.revealAnswers = !state.revealAnswers;
  renderVerb(state.currentId);
  updateButtons();
  persistState();
}

function handleNext() {
  if (!state.remaining.length) {
    showToast("Ya repasaste toda la lista. Reinicia cuando quieras.");
    return;
  }

  if (state.remaining.length === 1 && state.remaining[0] === state.currentId) {
    showToast("Este es el último verbo pendiente. ¡Márcalo cuando lo recuerdes!");
    return;
  }

  const nextId = pickRandomId(excludeCurrentPool());
  setCurrentVerb(nextId, { reveal: false });
}

function handleRemember() {
  if (state.currentId === null) return;
  const { currentId } = state;
  if (!state.remaining.includes(currentId)) {
    showToast("Ese verbo ya estaba marcado como recordado.");
    return;
  }

  state.remaining = state.remaining.filter((id) => id !== currentId);
  if (!state.learned.includes(currentId)) {
    state.learned.push(currentId);
  }
  state.history.push(currentId);

  updateProgress();
  persistState();
  showToast("¡Bien hecho! Verbo recordado.");

  if (state.remaining.length) {
    const nextId = pickRandomId(state.remaining);
    setCurrentVerb(nextId, { reveal: false });
  } else {
    setCurrentVerb(null, { reveal: true });
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

  setCurrentVerb(lastId, { reveal: true });
  updateProgress();
  persistState();
  showToast("Último verbo restaurado.");
}

function handleReset(resetStorage) {
  if (resetStorage) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("No se pudo limpiar el almacenamiento:", error);
    }
  }

  state = defaultState();
  const nextId = pickRandomId(state.remaining);
  setCurrentVerb(nextId, { reveal: false, persist: false });
  updateProgress();
  persistState();
  showToast(resetStorage ? "Progreso eliminado por completo." : "Lista reiniciada.");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

    // Remove learned verbs from remaining if both lists contain the same id.
    const filteredRemaining = remaining.filter((id) => !learned.includes(id));

    const learnedAll = learned.length === TOTAL_VERBS;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("No se pudo guardar el progreso:", error);
  }
}

function selectInitialCurrent() {
  if (state.currentId !== null && state.remaining.includes(state.currentId)) {
    return state.currentId;
  }
  return pickRandomId(state.remaining);
}

function setCurrentVerb(id, { reveal = false, persist = true } = {}) {
  state.currentId = id;
  state.revealAnswers = reveal && id !== null ? reveal : false;
  renderVerb(id);
  updateButtons();
  if (persist) {
    persistState();
  }
}

function renderVerb(id) {
  const verb = id !== null ? VERB_BY_ID.get(id) : null;

  if (!verb) {
    if (state.learned.length === TOTAL_VERBS) {
      spanishTitle.textContent = "¡Todo completado!";
      spanishCell.textContent = "🎉";
      presentCell.textContent = "—";
      pastCell.textContent = "—";
      participleCell.textContent = "—";
    } else {
      spanishTitle.textContent = "Selecciona un verbo";
      spanishCell.textContent = "—";
      presentCell.textContent = "—";
      pastCell.textContent = "—";
      participleCell.textContent = "—";
    }
    toggleButton.textContent = "Mostrar respuestas";
    return;
  }

  spanishTitle.textContent = verb.spanish;
  spanishCell.textContent = verb.spanish;
  presentCell.textContent = state.revealAnswers ? verb.present : PLACEHOLDER;
  pastCell.textContent = state.revealAnswers ? verb.past : PLACEHOLDER;
  participleCell.textContent = state.revealAnswers ? verb.participle : PLACEHOLDER;
  toggleButton.textContent = state.revealAnswers ? "Ocultar respuestas" : "Mostrar respuestas";
}

function updateProgress() {
  const learnedCount = state.learned.length;
  const text = `Aprendidos: ${learnedCount} / ${TOTAL_VERBS}`;
  progressLabel.textContent = text;
  const percentage = TOTAL_VERBS ? Math.round((learnedCount / TOTAL_VERBS) * 100) : 0;
  progressBar.style.width = `${percentage}%`;
}

function updateButtons() {
  const hasCurrent = state.currentId !== null;
  const undoButton = document.querySelector('[data-action="undo"]');
  const rememberButton = document.querySelector('[data-action="remember"]');
  const nextButton = document.querySelector('[data-action="next"]');
  const resetButton = document.querySelector('[data-action="reset"]');
  const speakButtons = document.querySelectorAll('[data-action^="speak-"]');

  toggleButton.disabled = !hasCurrent;
  rememberButton.disabled = !hasCurrent || !state.remaining.includes(state.currentId);
  undoButton.disabled = state.history.length === 0;
  resetButton.disabled = state.learned.length === 0 && state.history.length === 0;
  nextButton.disabled = !state.remaining.length || (state.remaining.length === 1 && state.remaining[0] === state.currentId);
  speakButtons.forEach((button) => {
    const disabled = !speechSupported || !hasCurrent;
    button.disabled = disabled;
    if (!speechSupported) {
      button.title = "Tu navegador no soporta audio todavía.";
    } else if (!hasCurrent) {
      button.removeAttribute("title");
    } else {
      button.title = "Reproducir pronunciación";
    }
  });
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
    }, 300);
  }, 2400);
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

function initSpeech() {
  if (speechSetup) return;
  speechSetup = true;

  if (!speechSupported) {
    return;
  }

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
  } else if (typeof synth.onvoiceschanged === "object") {
    synth.onvoiceschanged = selectVoice;
  }
}

function handleSpeak(form) {
  if (!speechSupported) {
    showToast("Tu navegador no soporta el audio aún.");
    return;
  }

  const verb = state.currentId !== null ? VERB_BY_ID.get(state.currentId) : null;
  if (!verb) {
    showToast("Primero selecciona un verbo.");
    return;
  }

  const text = verb[form];
  if (!text) {
    showToast("No hay audio disponible.");
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replace("/", " or "));
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
