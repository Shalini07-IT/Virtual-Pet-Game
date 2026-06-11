/* ===========================
   POCHI — Virtual Pet Script
   =========================== */

// ── Constants ──────────────────────────────────────────
const TICK_MS     = 3000;  // stat decay interval
const SAVE_KEY    = 'pochi_save_v2';

const ACHIEVEMENTS = [
  { id: 'feed10',    icon: '🍖', name: 'Well Fed',        desc: 'Feed your pet 10 times',          check: s => s.feedCount >= 10 },
  { id: 'play20',    icon: '🎾', name: 'Playtime Pro',    desc: 'Play with your pet 20 times',     check: s => s.playCount >= 20 },
  { id: 'lvl5',      icon: '⭐', name: 'Rising Star',     desc: 'Reach level 5',                   check: s => s.level >= 5 },
  { id: 'lvl10',     icon: '🌟', name: 'Superstar',       desc: 'Reach level 10',                  check: s => s.level >= 10 },
  { id: 'healthy30', icon: '💚', name: 'Healthy Streak',  desc: 'Keep pet healthy for 30 minutes', check: s => s.healthySeconds >= 1800 },
];

// ── State ───────────────────────────────────────────────
let state = {
  name: '',
  hunger: 100,
  happy: 100,
  energy: 100,
  health: 100,
  xp: 0,
  level: 1,
  age: 0,               // in seconds
  birthTimestamp: Date.now(),
  feedCount: 0,
  playCount: 0,
  healthySeconds: 0,
  achievements: {},
  skin: 'default',
  sleeping: false,
  lastSave: Date.now(),
};

let tickTimer = null;
let ageTimer  = null;
let notifQueue = [];
let notifActive = false;

// ── DOM References ──────────────────────────────────────
const petSvg      = document.getElementById('petSvg');
const petNameInput = document.getElementById('petNameInput');
const petMoodBadge = document.getElementById('petMoodBadge');
const petAge       = document.getElementById('petAge');
const petLevel     = document.getElementById('petLevel');

const barHunger = document.getElementById('barHunger');
const barHappy  = document.getElementById('barHappy');
const barEnergy = document.getElementById('barEnergy');
const barHealth = document.getElementById('barHealth');
const valHunger = document.getElementById('valHunger');
const valHappy  = document.getElementById('valHappy');
const valEnergy = document.getElementById('valEnergy');
const valHealth = document.getElementById('valHealth');

const xpBar    = document.getElementById('xpBar');
const xpText   = document.getElementById('xpText');
const xpLevel  = document.getElementById('xpLevel');
const achiev   = document.getElementById('achievList');
const notifContainer = document.getElementById('notifications');

const btnFeed    = document.getElementById('btnFeed');
const btnPlay    = document.getElementById('btnPlay');
const btnSleep   = document.getElementById('btnSleep');
const btnHeal    = document.getElementById('btnHeal');
const btnClean   = document.getElementById('btnClean');
const btnDayNight = document.getElementById('btnDayNight');
const btnReset   = document.getElementById('btnReset');

// SVG mood elements
const leftEye    = document.getElementById('leftEye');
const rightEye   = document.getElementById('rightEye');
const sleepEyes  = document.getElementById('sleepEyes');
const sickEyes   = document.getElementById('sickEyes');
const mouthHappy = document.getElementById('mouthHappy');
const mouthNormal= document.getElementById('mouthNormal');
const mouthSad   = document.getElementById('mouthSad');
const mouthSick  = document.getElementById('mouthSick');
const blushLeft  = document.getElementById('blushLeft');
const blushRight = document.getElementById('blushRight');
const sleepZzz   = document.getElementById('sleepZzz');
const sickSwirls = document.getElementById('sickSwirls');

// ── Init ────────────────────────────────────────────────
function init() {
  loadState();
  buildAchievements();
  renderAll();
  startTimers();
  bindEvents();
  applySkin(state.skin);
}

// ── Save / Load ─────────────────────────────────────────
function saveState() {
  state.lastSave = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    // Offline time simulation: decay stats for time elapsed while away
    const elapsed = Math.floor((Date.now() - saved.lastSave) / 1000);
    Object.assign(state, saved);
    applyOfflineDecay(elapsed);
  } catch(e) {
    console.warn('Save corrupt, starting fresh.');
  }
}

function applyOfflineDecay(seconds) {
  const ticks = Math.floor(seconds / (TICK_MS / 1000));
  for (let i = 0; i < Math.min(ticks, 600); i++) {
    decayStats(true);
  }
}

function resetGame() {
  if (!confirm('Reset your game? All progress will be lost.')) return;
  localStorage.removeItem(SAVE_KEY);
  Object.assign(state, {
    name: '', hunger: 100, happy: 100, energy: 100, health: 100,
    xp: 0, level: 1, age: 0, birthTimestamp: Date.now(),
    feedCount: 0, playCount: 0, healthySeconds: 0,
    achievements: {}, skin: 'default', sleeping: false, lastSave: Date.now(),
  });
  petNameInput.value = '';
  renderAll();
  notify('🔄 Game reset!', '');
}

// ── Timers ───────────────────────────────────────────────
function startTimers() {
  tickTimer = setInterval(gameTick, TICK_MS);
  ageTimer  = setInterval(ageTick, 1000);
}

function gameTick() {
  if (!state.sleeping) {
    decayStats();
  } else {
    // While sleeping: restore energy faster
    state.energy = Math.min(100, state.energy + 5);
  }
  checkHealth();
  checkNotifications();
  checkAchievements();
  updateMood();
  renderStats();
  saveState();
}

function ageTick() {
  state.age++;
  if (state.health > 50 && state.hunger > 30 && state.happy > 30) {
    state.healthySeconds++;
  }
  const days = Math.floor((Date.now() - state.birthTimestamp) / 86400000);
  petAge.textContent = days;
}

function decayStats(silent = false) {
  state.hunger  = clamp(state.hunger  - 2, 0, 100);
  state.happy   = clamp(state.happy   - 1.5, 0, 100);
  state.energy  = clamp(state.energy  - 1, 0, 100);
}

function checkHealth() {
  if (state.hunger <= 0) {
    state.health = clamp(state.health - 3, 0, 100);
  }
  if (state.energy <= 0) {
    state.happy = clamp(state.happy - 2, 0, 100);
  }
}

// ── Notifications ────────────────────────────────────────
let lastNotifTime = {};
function checkNotifications() {
  const now = Date.now();
  const throttle = (key, ms, msg, cls) => {
    if (!lastNotifTime[key] || now - lastNotifTime[key] > ms) {
      notify(msg, cls);
      lastNotifTime[key] = now;
    }
  };
  if (state.hunger < 25)   throttle('hungry', 25000, '🍖 Your pet is hungry!', 'notif-warning');
  if (state.energy < 20)   throttle('tired',  25000, '😴 Your pet is tired!', 'notif-warning');
  if (state.happy < 20)    throttle('sad',    30000, '💔 Your pet is sad!', 'notif-warning');
  if (state.health < 20)   throttle('sick',   30000, '🤒 Your pet is sick!', 'notif-warning');
}

function notify(message, cls = '') {
  notifQueue.push({ message, cls });
  if (!notifActive) drainNotifQueue();
}

function drainNotifQueue() {
  if (!notifQueue.length) { notifActive = false; return; }
  notifActive = true;
  const { message, cls } = notifQueue.shift();
  const el = document.createElement('div');
  el.className = 'notif' + (cls ? ' ' + cls : '');
  el.textContent = message;
  notifContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('notif-exit');
    setTimeout(() => {
      el.remove();
      setTimeout(drainNotifQueue, 120);
    }, 320);
  }, 2800);
}

// ── Mood ─────────────────────────────────────────────────
function getMood() {
  if (state.sleeping) return 'sleeping';
  if (state.health < 20) return 'sick';
  if (state.happy < 30)  return 'sad';
  if (state.hunger > 70 && state.happy > 70 && state.health > 70) return 'happy';
  return 'normal';
}

const MOOD_LABELS = {
  happy: '😊 Happy', normal: '😐 Normal',
  sad: '😢 Sad', sick: '🤒 Sick', sleeping: '😴 Sleeping',
};
const MOOD_BADGE_CLASSES = ['sad', 'sick', 'sleeping'];

function updateMood() {
  const mood = getMood();
  // SVG Animations
  petSvg.className.baseVal = '';
  petSvg.classList.add('mood-' + mood);

  // Eyes
  leftEye.classList.toggle('hidden', mood === 'sleeping' || mood === 'sick');
  rightEye.classList.toggle('hidden', mood === 'sleeping' || mood === 'sick');
  sleepEyes.classList.toggle('hidden', mood !== 'sleeping');
  sickEyes.classList.toggle('hidden', mood !== 'sick');

  // Mouth
  mouthHappy.classList.toggle('hidden', mood !== 'happy' && mood !== 'sleeping');
  mouthNormal.classList.toggle('hidden', mood !== 'normal');
  mouthSad.classList.toggle('hidden', mood !== 'sad');
  mouthSick.classList.toggle('hidden', mood !== 'sick');

  // Extras
  blushLeft.classList.toggle('hidden', mood === 'sad' || mood === 'sick');
  blushRight.classList.toggle('hidden', mood === 'sad' || mood === 'sick');
  sleepZzz.classList.toggle('hidden', mood !== 'sleeping');
  sickSwirls.classList.toggle('hidden', mood !== 'sick');

  // Badge
  petMoodBadge.textContent = MOOD_LABELS[mood] || '😐 Normal';
  petMoodBadge.className = 'mood-badge';
  if (MOOD_BADGE_CLASSES.includes(mood)) petMoodBadge.classList.add(mood);
}

// ── Actions ───────────────────────────────────────────────
function doFeed() {
  if (state.sleeping) { wakeUp(); }
  state.hunger = clamp(state.hunger + 20, 0, 100);
  state.happy  = clamp(state.happy  + 5,  0, 100);
  state.feedCount++;
  addXP(5, '🍖 +5 XP');
  flashBtn(btnFeed);
  renderAll();
  saveState();
}

function doPlay() {
  if (state.sleeping) { wakeUp(); }
  if (state.energy < 10) { notify('😴 Too tired to play!', 'notif-warning'); return; }
  state.happy  = clamp(state.happy  + 20, 0, 100);
  state.energy = clamp(state.energy - 10, 0, 100);
  state.playCount++;
  addXP(10, '🎾 +10 XP');
  flashBtn(btnPlay);
  renderAll();
  saveState();
}

function doSleep() {
  if (state.sleeping) {
    wakeUp();
  } else {
    state.sleeping = true;
    btnSleep.classList.add('sleeping-active');
    btnSleep.querySelector('.btn-label').textContent = 'Wake Up';
    notify('😴 Your pet is sleeping…', '');
    updateMood();
    saveState();
  }
}

function wakeUp() {
  state.sleeping = false;
  btnSleep.classList.remove('sleeping-active');
  btnSleep.querySelector('.btn-label').textContent = 'Sleep';
  updateMood();
}

function doHeal() {
  if (state.sleeping) wakeUp();
  state.health = clamp(state.health + 25, 0, 100);
  addXP(8, '💊 +8 XP');
  flashBtn(btnHeal);
  renderAll();
  saveState();
}

function doClean() {
  if (state.sleeping) wakeUp();
  state.health = clamp(state.health + 10, 0, 100);
  state.happy  = clamp(state.happy  + 10, 0, 100);
  addXP(5, '🛁 +5 XP');
  flashBtn(btnClean);
  renderAll();
  saveState();
}

// ── XP & Levels ───────────────────────────────────────────
function addXP(amount, label) {
  state.xp += amount;
  const needed = 100;
  const leveled = Math.floor(state.xp / needed);
  if (leveled > state.level - 1) {
    state.level = leveled + 1;
    notify(`🌟 Level Up! You're level ${state.level}!`, 'notif-levelup');
    petLevel.classList.add('xp-pop');
    setTimeout(() => petLevel.classList.remove('xp-pop'), 400);
  }
  renderXP();
  checkAchievements();
}

// ── Achievements ─────────────────────────────────────────
function buildAchievements() {
  achiev.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const div = document.createElement('div');
    div.className = 'achiev-item' + (state.achievements[a.id] ? ' unlocked' : '');
    div.id = 'ach-' + a.id;
    div.innerHTML = `
      <span class="achiev-icon">${a.icon}</span>
      <div class="achiev-info">
        <div class="achiev-name">${a.name}</div>
        <div class="achiev-desc">${a.desc}</div>
      </div>
      <span class="achiev-check">✅</span>`;
    achiev.appendChild(div);
  });
}

function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!state.achievements[a.id] && a.check(state)) {
      state.achievements[a.id] = true;
      const el = document.getElementById('ach-' + a.id);
      if (el) el.classList.add('unlocked');
      notify(`🏆 Achievement: ${a.name}!`, 'notif-achiev');
      saveState();
    }
  });
}

// ── Render ────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderXP();
  updateMood();
  if (state.name) petNameInput.value = state.name;
  const days = Math.floor((Date.now() - state.birthTimestamp) / 86400000);
  petAge.textContent = days;
  petLevel.textContent = state.level;
}

function renderStats() {
  setBar(barHunger, valHunger, state.hunger);
  setBar(barHappy,  valHappy,  state.happy);
  setBar(barEnergy, valEnergy, state.energy);
  setBar(barHealth, valHealth, state.health);
  updateMood();
}

function setBar(barEl, valEl, val) {
  const v = Math.round(val);
  barEl.style.width = v + '%';
  valEl.textContent = v;
  // Color warning at low values
  barEl.style.opacity = v < 20 ? '0.7' : '1';
}

function renderXP() {
  const xpInLevel = state.xp % 100;
  xpBar.style.width = xpInLevel + '%';
  xpText.textContent = `${xpInLevel} / 100 XP`;
  xpLevel.textContent = state.level;
  petLevel.textContent = state.level;
}

// ── Skins ─────────────────────────────────────────────────
function applySkin(skin) {
  document.body.classList.remove('skin-bunny', 'skin-bear');
  if (skin === 'bunny') document.body.classList.add('skin-bunny');
  if (skin === 'bear')  document.body.classList.add('skin-bear');
  document.querySelectorAll('.skin-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skin === skin);
  });
  state.skin = skin;
}

// ── Day/Night ─────────────────────────────────────────────
function toggleDayNight() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  btnDayNight.textContent = isLight ? '🌙' : '☀️';
}

// ── UI Helpers ────────────────────────────────────────────
function flashBtn(btn) {
  btn.style.transform = 'scale(0.9)';
  setTimeout(() => btn.style.transform = '', 180);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// ── Event Bindings ────────────────────────────────────────
function bindEvents() {
  btnFeed.addEventListener('click', doFeed);
  btnPlay.addEventListener('click', doPlay);
  btnSleep.addEventListener('click', doSleep);
  btnHeal.addEventListener('click', doHeal);
  btnClean.addEventListener('click', doClean);

  btnDayNight.addEventListener('click', toggleDayNight);
  btnReset.addEventListener('click', resetGame);

  petNameInput.addEventListener('input', () => {
    state.name = petNameInput.value.trim();
    saveState();
  });

  document.querySelectorAll('.skin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applySkin(btn.dataset.skin);
      saveState();
    });
  });

  // Save on visibility change (tab hide)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveState();
  });
}

// ── Boot ──────────────────────────────────────────────────
init();
