const DEFAULT_CFG = {
  FLOW_TTL: 8_000,
  NODE_TTL: 30_000,
  MAX_PARTICLES: 5,
  PARTICLE_SPEED: 0.015,
  PARTICLE_SPEED_JITTER: 0.006,
  TRAIL_T: 0.12,
  TRAIL_SAMPLES: 8,
  TRAIL_SEGMENTS: 4,
  MAX_SPAWN_RATE: 8,
  SPAWN_DEBT_CAP: 2,
  SIZE_MIN: 2.5,
  SIZE_LOG_SCALE: 2,
  SIZE_MAX: 7.5,
  PULSE_SPEED: 1.4,
  PULSE_DECAY: 0.028,
  PULSE_INIT_ALPHA: 0.6,
  SMOOTH_FLOW: 0.85,
  SMOOTH_NODE: 0.90,
  NODE_BPS_DECAY: 0.99,
  CENTRAL_HOST: '192.168.0.1',
  WS_HOST: '',
  WS_PORT: 8765,
  WS_SCHEME: 'ws',
  WS_URL: '',
  LAYOUT: 'circle',
  LOG_W: 240,
  INNER_R_FRAC: 0.30,
  OUTER_R_FRAC: 0.46,
  INNER_JITTER: 0.03,
  OUTER_JITTER: 0.03,
  BEZIER_CURVE: 0.35,
  BEZIER_MAX_OFF: 80,
  LINE_WIDTH_MIN: 0.4,
  LINE_WIDTH_MAX: 3,
  LINE_ALPHA_BASE: 0.06,
  NODE_ACTIVITY_DECAY: 0.006,
  SHOW_DNS_NAMES: true,
  NODE_LABEL_FONT_SIZE: 10,
  CENTER_LABEL_FONT_SIZE: 11,
  NODE_LABEL_ALPHA_BASE: 0.72,
  NODE_LABEL_ALPHA_ACTIVITY: 0.30,
};

const APP_CONFIG = window.APP_CONFIG || {};
const STORAGE_KEYS = {
  CFG: 'trafaret.ui.cfg.v1',
  PROTO: 'trafaret.ui.proto.v1',
};

function loadStoredObject(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveStoredObject(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

const storedCfgOverrides = loadStoredObject(STORAGE_KEYS.CFG);

const CFG = {...DEFAULT_CFG};
Object.assign(CFG, APP_CONFIG, storedCfgOverrides);

const SETTINGS_META = {
  WS_HOST: {group:'Connection', label:'WS host', type:'text', desc:'Хост для WebSocket. Если пусто, используется hostname страницы.'},
  WS_PORT: {group:'Connection', label:'WS port', type:'number', min:1, max:65535, step:1, integer:true, desc:'Порт WebSocket.'},
  WS_SCHEME: {group:'Connection', label:'WS scheme', type:'select', options:['ws','wss'], desc:'Протокол WebSocket. Для HTTPS/LuCI обычно нужен wss или proxy.'},
  WS_URL: {group:'Connection', label:'WS URL', type:'text', desc:'Полный URL WebSocket. Если заполнен, перекрывает host/port/scheme.'},
  CENTRAL_HOST: {group:'Connection', label:'Central host', type:'text', desc:'Центральный хост. Если есть соединение, отправляется серверу как новый center.'},
  LAYOUT: {group:'Connection', label:'Layout', type:'select', options:['circle','horizontal'], desc:'Начальный вид раскладки узлов.'},
  FLOW_TTL: {group:'Lifetime', label:'Flow TTL', type:'number', min:500, max:120000, step:100, integer:true, desc:'Сколько миллисекунд держать флоу без новых пакетов.'},
  NODE_TTL: {group:'Lifetime', label:'Node TTL', type:'number', min:1000, max:300000, step:500, integer:true, desc:'Сколько миллисекунд держать неактивный хост.'},
  MAX_PARTICLES: {group:'Particles', label:'Max particles', type:'number', min:0, max:50, step:1, integer:true, desc:'Максимум летящих частиц на один флоу.'},
  PARTICLE_SPEED: {group:'Particles', label:'Particle speed', type:'number', min:0.001, max:0.1, step:0.001, desc:'Базовая скорость движения частицы по траектории.'},
  PARTICLE_SPEED_JITTER: {group:'Particles', label:'Speed jitter', type:'number', min:0, max:0.05, step:0.001, desc:'Случайный разброс скоростей между частицами.'},
  TRAIL_T: {group:'Particles', label:'Trail length', type:'number', min:0.01, max:0.5, step:0.01, desc:'Длина хвоста частицы в долях пути.'},
  TRAIL_SAMPLES: {group:'Particles', label:'Trail samples', type:'number', min:2, max:32, step:1, integer:true, desc:'Количество точек сэмплирования хвоста.'},
  TRAIL_SEGMENTS: {group:'Particles', label:'Trail segments', type:'number', min:1, max:12, step:1, integer:true, desc:'На сколько секций делится хвост.'},
  MAX_SPAWN_RATE: {group:'Particles', label:'Spawn rate', type:'number', min:0, max:50, step:0.5, desc:'Максимум новых частиц в секунду на флоу.'},
  SPAWN_DEBT_CAP: {group:'Particles', label:'Spawn debt cap', type:'number', min:0, max:20, step:0.5, desc:'Ограничение накопленного долга на создание частиц.'},
  SIZE_MIN: {group:'Particles', label:'Size min', type:'number', min:0.5, max:20, step:0.1, desc:'Минимальный радиус частицы.'},
  SIZE_LOG_SCALE: {group:'Particles', label:'Size log scale', type:'number', min:0, max:10, step:0.1, desc:'Во сколько размер растёт от bandwidth.'},
  SIZE_MAX: {group:'Particles', label:'Size max', type:'number', min:1, max:30, step:0.1, desc:'Максимальный радиус частицы.'},
  PULSE_SPEED: {group:'Nodes', label:'Pulse speed', type:'number', min:0.1, max:10, step:0.1, desc:'Скорость расширения кольца на узле.'},
  PULSE_DECAY: {group:'Nodes', label:'Pulse decay', type:'number', min:0.001, max:0.2, step:0.001, desc:'Скорость исчезновения кольца на узле.'},
  PULSE_INIT_ALPHA: {group:'Nodes', label:'Pulse alpha', type:'number', min:0.05, max:1, step:0.01, desc:'Начальная прозрачность пульса.'},
  SMOOTH_FLOW: {group:'Nodes', label:'Flow smooth', type:'number', min:0, max:0.999, step:0.01, desc:'Инерция сглаживания pps/bps флоу.'},
  SMOOTH_NODE: {group:'Nodes', label:'Node smooth', type:'number', min:0, max:0.999, step:0.01, desc:'Резерв для сглаживания статистики хостов.'},
  NODE_BPS_DECAY: {group:'Nodes', label:'Node bps decay', type:'number', min:0.8, max:0.9999, step:0.001, desc:'Скорость угасания размера хоста.'},
  NODE_ACTIVITY_DECAY: {group:'Nodes', label:'Activity decay', type:'number', min:0.001, max:0.1, step:0.001, desc:'Как быстро гаснет подсветка активности хоста.'},
  SHOW_DNS_NAMES: {group:'Nodes', label:'Show DNS names', type:'boolean', desc:'Показывать DNS-имена вместо IP-адресов. При выключении все подписи переключаются обратно на IP.'},
  NODE_LABEL_FONT_SIZE: {group:'Node labels', label:'Node font size', type:'number', min:6, max:32, step:1, integer:true, desc:'Размер шрифта подписей обычных нод.'},
  CENTER_LABEL_FONT_SIZE: {group:'Node labels', label:'Center font size', type:'number', min:6, max:36, step:1, integer:true, desc:'Размер шрифта подписи центральной ноды.'},
  NODE_LABEL_ALPHA_BASE: {group:'Node labels', label:'Label alpha base', type:'number', min:0.05, max:1, step:0.01, desc:'Базовая яркость подписей нод даже без активности.'},
  NODE_LABEL_ALPHA_ACTIVITY: {group:'Node labels', label:'Label flash boost', type:'number', min:0, max:1, step:0.01, desc:'Насколько подпись дополнительно усиливается при активности.'},
  LOG_W: {group:'Layout', label:'Log panel width', type:'number', min:160, max:480, step:10, integer:true, desc:'Ширина правой панели журнала.'},
  INNER_R_FRAC: {group:'Layout', label:'Inner radius', type:'number', min:0.1, max:0.8, step:0.01, desc:'Радиус окружности локальных хостов.'},
  OUTER_R_FRAC: {group:'Layout', label:'Outer radius', type:'number', min:0.1, max:0.95, step:0.01, desc:'Радиус окружности внешних хостов.'},
  INNER_JITTER: {group:'Layout', label:'Inner jitter', type:'number', min:0, max:0.2, step:0.005, desc:'Небольшой радиальный джиттер для внутреннего круга.'},
  OUTER_JITTER: {group:'Layout', label:'Outer jitter', type:'number', min:0, max:0.2, step:0.005, desc:'Небольшой радиальный джиттер для внешнего круга.'},
  BEZIER_CURVE: {group:'Layout', label:'Bezier curve', type:'number', min:0, max:1, step:0.01, desc:'Насколько сильно изгибать траектории.'},
  BEZIER_MAX_OFF: {group:'Layout', label:'Bezier max off', type:'number', min:0, max:300, step:1, integer:true, desc:'Максимальное отклонение контрольной точки кривой.'},
  LINE_WIDTH_MIN: {group:'Lines', label:'Line width min', type:'number', min:0.1, max:10, step:0.1, desc:'Минимальная толщина трека флоу.'},
  LINE_WIDTH_MAX: {group:'Lines', label:'Line width max', type:'number', min:0.1, max:20, step:0.1, desc:'Максимальная толщина трека флоу.'},
  LINE_ALPHA_BASE: {group:'Lines', label:'Line alpha', type:'number', min:0, max:1, step:0.01, desc:'Базовая прозрачность трека флоу.'},
};

const DEFAULT_PROTO_COLORS = {
  TCP:'#378ADD', UDP:'#1D9E75', DNS:'#EF9F27',
  TLS:'#7F77DD', HTTP:'#639922', ICMP:'#D85A30',
  ARP:'#D4537E', SSH:'#5DCAA5', IP:'#888780',
};

const storedProtoColors = loadStoredObject(STORAGE_KEYS.PROTO);

const PROTO = Object.fromEntries(
  Object.entries(DEFAULT_PROTO_COLORS).map(([key, color]) => [key, {c: storedProtoColors[key] || color}])
);

Object.keys(DEFAULT_PROTO_COLORS).forEach(proto => {
  SETTINGS_META[`PROTO_COLOR_${proto}`] = {
    group: 'Protocol colors',
    label: `${proto} color`,
    type: 'color',
    desc: `Цвет линий и частиц для протокола ${proto}.`,
  };
});

const PORT_PROTO = {
  53:'DNS', 80:'HTTP', 443:'TLS', 22:'SSH', 8080:'HTTP',
  8443:'TLS', 21:'TCP', 25:'TCP', 587:'TLS', 993:'TLS',
};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const wrapEl = document.getElementById('wrap');
const layoutBtn = document.getElementById('layoutbtn');
const fullscreenBtn = document.getElementById('fullscreenbtn');
const settingsBtn = document.getElementById('settingsbtn');
const ifaceSelect = document.getElementById('iface');
const centerSelect = document.getElementById('center');
const logEl = document.getElementById('log');
const logPauseBtn = document.getElementById('logpausebtn');
const dot = document.getElementById('wsdot');
const txt = document.getElementById('wstxt');
const statPpsEl = document.getElementById('spps');
const statBpsEl = document.getElementById('sbps');
const statNodesEl = document.getElementById('snodes');
const statFlowsEl = document.getElementById('sflows');
const settingsOverlay = document.getElementById('settingsoverlay');
const settingsBody = document.getElementById('settingsbody');
const settingsCloseBtn = document.getElementById('settingsclose');
const settingsApplyBtn = document.getElementById('settingsapply');
const settingsResetBtn = document.getElementById('settingsreset');

let W, H, CX, CY;
let resizeTimer;
let socket;
let layout = CFG.LAYOUT;
let currentInterface = '';
let availableInterfaces = [];
let lastFrame = Date.now();
let lastStatFlush = Date.now();
let statPkts = 0;
let statBytes = 0;
let smoothPps = 0;
let smoothBps = 0;
let logPaused = false;

const nodes = new Map();
const flows = new Map();
const logLines = [];
const hiddenHosts = new Set();

const isLocal = ip => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const hashIp = (ip, salt = 0) => `${ip}:${salt}`.split('').reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, 5381);
const unit = (ip, salt = 0) => (hashIp(ip, salt) % 1000) / 999;
const byIp = (a, b) => a.ip.localeCompare(b.ip, undefined, {numeric: true});

function resolveProto(raw, sport, dport) {
  const sp = parseInt(sport), dp = parseInt(dport);
  if (raw === 'UDP' && (sp === 53 || dp === 53)) return 'DNS';
  if (raw === 'TCP') return PORT_PROTO[dp] || PORT_PROTO[sp] || 'TCP';
  return raw || 'IP';
}

function renderLegend() {
  const legEl = document.getElementById('legend');
  legEl.innerHTML = '';
  Object.entries(PROTO).forEach(([k, v]) => {
    legEl.innerHTML += `<div class="li"><div class="ld" style="background:${v.c}"></div>${k}</div>`;
  });
}

function flowColor(proto) {
  return (PROTO[proto] || PROTO.IP).c;
}

function fallbackNodeColor(n) {
  return n.loc ? '#1D9E75' : '#378ADD';
}

function nodeColor(n) {
  return n.lastProto ? flowColor(n.lastProto) : fallbackNodeColor(n);
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return {r: 136, g: 135, b: 128};
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function particleSize(bpsLike) {
  return Math.min(CFG.SIZE_MAX, CFG.SIZE_MIN + Math.log10(Math.max(1, bpsLike / 200)) * CFG.SIZE_LOG_SCALE);
}

function spawnParticle(f, bpsLike = 0, t = 0) {
  if (f.particles.length >= CFG.MAX_PARTICLES) return;
  f.particles.push({
    t,
    speed: CFG.PARTICLE_SPEED + Math.random() * CFG.PARTICLE_SPEED_JITTER,
    sz: particleSize(bpsLike),
  });
}

function syncFlowColors() {
  flows.forEach(f => {
    f.color = flowColor(f.proto);
  });
}

function hasStoredCfgOverride(key) {
  return Object.prototype.hasOwnProperty.call(storedCfgOverrides, key);
}

function currentCfgOverrides() {
  const overrides = {};
  const baseCfg = {...DEFAULT_CFG, ...APP_CONFIG};
  Object.keys(SETTINGS_META).forEach(key => {
    if (key.startsWith('PROTO_COLOR_')) return;
    if (CFG[key] !== baseCfg[key]) overrides[key] = CFG[key];
  });
  return overrides;
}

function currentProtoOverrides() {
  const overrides = {};
  Object.entries(DEFAULT_PROTO_COLORS).forEach(([proto, color]) => {
    if (PROTO[proto]?.c !== color) overrides[proto] = PROTO[proto].c;
  });
  return overrides;
}

function persistRuntimeSettings() {
  const cfgOverrides = currentCfgOverrides();
  const protoOverrides = currentProtoOverrides();
  Object.keys(storedCfgOverrides).forEach(key => delete storedCfgOverrides[key]);
  Object.assign(storedCfgOverrides, cfgOverrides);
  saveStoredObject(STORAGE_KEYS.CFG, cfgOverrides);
  saveStoredObject(STORAGE_KEYS.PROTO, protoOverrides);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w < 100 || h < 100) return;
  W = canvas.width = w;
  H = canvas.height = h;
  CX = (W - CFG.LOG_W) / 2;
  CY = 52 + (H - 52) / 2;
}

function updateStats() {
  statPpsEl.textContent = smoothPps;
  statBpsEl.textContent = fmtBytes(smoothBps);
  statNodesEl.textContent = nodes.size;
  statFlowsEl.textContent = [...flows.values()].filter(f => !isFlowHidden(f)).length;
}

function renderLog(force = false) {
  if (logPaused && !force) return;
  logEl.innerHTML = logLines.join('<br>');
}

function updateLogPauseButton() {
  logPauseBtn.textContent = logPaused ? 'resume' : 'pause';
  logPauseBtn.classList.toggle('paused', logPaused);
}

function pushLog(line) {
  logLines.unshift(line);
  if (logLines.length > 14) logLines.pop();
  renderLog();
}

function pushSystemLog(text) {
  pushLog(`<span style="color:rgba(255,255,255,0.35)">SYS</span> ${text}`);
}

function resetScene(note = '') {
  nodes.clear();
  flows.clear();
  hiddenHosts.clear();
  logLines.length = 0;
  renderLog(true);
  statPkts = 0;
  statBytes = 0;
  smoothPps = 0;
  smoothBps = 0;
  lastStatFlush = Date.now();
  updateStats();
  ensureCentralNode();
  updateCenterSelect();
  relayout();
  if (note) pushSystemLog(note);
}

function syncNodeRoles() {
  nodes.forEach(n => {
    n.central = n.ip === CFG.CENTRAL_HOST;
    n.loc = n.central || isLocal(n.ip);
  });
}

function updateLayoutButton() {
  CFG.LAYOUT = layout;
  layoutBtn.textContent = `layout: ${layout}`;
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fullscreenSupported() {
  return !!(wrapEl.requestFullscreen || wrapEl.webkitRequestFullscreen || document.exitFullscreen || document.webkitExitFullscreen);
}

function updateFullscreenButton() {
  if (!fullscreenSupported()) {
    fullscreenBtn.textContent = 'fullscreen n/a';
    fullscreenBtn.disabled = true;
    return;
  }
  fullscreenBtn.disabled = false;
  fullscreenBtn.textContent = fullscreenElement() ? 'exit fullscreen' : 'fullscreen';
}

async function enterFullscreen() {
  if (wrapEl.requestFullscreen) {
    await wrapEl.requestFullscreen();
    return;
  }
  if (wrapEl.webkitRequestFullscreen) wrapEl.webkitRequestFullscreen();
}

async function leaveFullscreen() {
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (document.webkitExitFullscreen) document.webkitExitFullscreen();
}

async function toggleFullscreen() {
  if (!fullscreenSupported()) return;
  try {
    if (fullscreenElement()) await leaveFullscreen();
    else await enterFullscreen();
  } catch (_) {}
  updateFullscreenButton();
}

function syncSettingsPanel() {
  if (!settingsOverlay.hidden) renderSettingsForm();
}

function updateInterfaceSelect() {
  const selected = currentInterface || ifaceSelect.value || '';
  const options = availableInterfaces.length ? [...availableInterfaces] : (currentInterface ? [currentInterface] : []);
  ifaceSelect.innerHTML = '';
  if (!options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = socket ? 'loading…' : 'no interfaces';
    ifaceSelect.appendChild(opt);
    ifaceSelect.disabled = true;
    return;
  }
  options.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    ifaceSelect.appendChild(opt);
  });
  ifaceSelect.value = options.includes(selected) ? selected : options[0];
  ifaceSelect.disabled = !socket || socket.readyState !== WebSocket.OPEN;
}

function hostOptions() {
  const items = [...nodes.values()].map(n => ({value: n.ip, label: n.label || n.ip}));
  if (CFG.CENTRAL_HOST && !items.some(x => x.value === CFG.CENTRAL_HOST)) {
    items.unshift({value: CFG.CENTRAL_HOST, label: CFG.CENTRAL_HOST});
  }
  items.sort((a, b) => a.value.localeCompare(b.value, undefined, {numeric: true}));
  return items;
}

let _centerSelectPending = false;

function _rebuildCenterOptions(options) {
  const preserved = centerSelect.value;
  centerSelect.innerHTML = '';
  if (!options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'no hosts';
    centerSelect.appendChild(opt);
    centerSelect.disabled = true;
    return;
  }
  options.forEach(({value, label}) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    centerSelect.appendChild(opt);
  });
  // restore preserved selection; fall back to CFG.CENTRAL_HOST
  centerSelect.value = options.some(x => x.value === preserved)
    ? preserved
    : CFG.CENTRAL_HOST;
  centerSelect.disabled = !socket || socket.readyState !== WebSocket.OPEN;
}

function updateCenterSelect() {
  const options = hostOptions();
  const newValues = options.map(o => o.value).join('\x00');
  const oldValues = [...centerSelect.options].map(o => o.value).join('\x00');
  const active = document.activeElement === centerSelect;

  if (newValues !== oldValues) {
    if (active) {
      // Defer rebuild until user closes the dropdown — innerHTML='' closes native dropdown
      _centerSelectPending = true;
    } else {
      _rebuildCenterOptions(options);
      return; // disabled already set inside
    }
  } else {
    // Update labels in-place for DNS name changes (no DOM rebuild needed)
    options.forEach(({value, label}) => {
      const opt = [...centerSelect.options].find(o => o.value === value);
      if (opt && opt.textContent !== label) opt.textContent = label;
    });
    // Sync displayed value to CFG.CENTRAL_HOST if it was changed externally
    // (e.g. server pushed a new center) — only when user is not browsing
    if (!active
        && centerSelect.value !== CFG.CENTRAL_HOST
        && options.some(x => x.value === CFG.CENTRAL_HOST)) {
      centerSelect.value = CFG.CENTRAL_HOST;
    }
  }
  centerSelect.disabled = !socket || socket.readyState !== WebSocket.OPEN;
}

function coerceSetting(key, raw) {
  const meta = SETTINGS_META[key];
  if (!meta) return raw;
  if (meta.type === 'boolean') return raw === true || raw === 'true' || raw === 'on';
  if (meta.type === 'color') return String(raw);
  if (meta.type === 'number') {
    let value = Number(raw);
    if (!Number.isFinite(value)) value = CFG[key];
    if (typeof meta.min === 'number') value = Math.max(meta.min, value);
    if (typeof meta.max === 'number') value = Math.min(meta.max, value);
    if (meta.integer) value = Math.round(value);
    return value;
  }
  return String(raw);
}

function getSettingValue(key) {
  if (key.startsWith('PROTO_COLOR_')) return PROTO[key.slice(12)]?.c || '#ffffff';
  return key === 'LAYOUT' ? layout : CFG[key];
}

function syncNodeLabels() {
  nodes.forEach(n => {
    n.label = (CFG.SHOW_DNS_NAMES && n.dnsName) ? n.dnsName : n.ip;
  });
}

function applySettingValue(key, value) {
  if (key.startsWith('PROTO_COLOR_')) {
    const proto = key.slice(12);
    if (PROTO[proto]) PROTO[proto].c = value;
    return;
  }
  CFG[key] = value;
}

function renderSettingsForm() {
  const groups = {};
  Object.entries(SETTINGS_META).forEach(([key, meta]) => {
    (groups[meta.group] ||= []).push([key, meta]);
  });
  settingsBody.innerHTML = '';
  Object.entries(groups).forEach(([group, entries]) => {
    const section = document.createElement('div');
    section.className = 'sg';
    const title = document.createElement('div');
    title.className = 'sgt';
    title.textContent = group;
    section.appendChild(title);
    entries.forEach(([key, meta]) => {
      const row = document.createElement('label');
      row.className = 'sr';
      const label = document.createElement('span');
      label.className = 'slbl';
      label.innerHTML = `<span>${meta.label}</span><span class="stip" title="${meta.desc}">?</span>`;
      let input;
      if (meta.type === 'select') {
        input = document.createElement('select');
        input.className = 'sselect';
        meta.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          input.appendChild(option);
        });
      } else if (meta.type === 'boolean') {
        input = document.createElement('input');
        input.className = 'sinput';
        input.type = 'checkbox';
        input.checked = !!getSettingValue(key);
        input.style.width = 'auto';
        input.style.height = '16px';
        input.style.cursor = 'pointer';
        input.style.accentColor = '#378ADD';
      } else {
        input = document.createElement('input');
        input.className = 'sinput';
        input.type = meta.type === 'number' ? 'number' : meta.type === 'color' ? 'color' : 'text';
        if (meta.type === 'number') {
          if (meta.min !== undefined) input.min = meta.min;
          if (meta.max !== undefined) input.max = meta.max;
          if (meta.step !== undefined) input.step = meta.step;
        }
      }
      input.dataset.key = key;
      if (meta.type !== 'boolean') input.value = getSettingValue(key);
      row.appendChild(label);
      row.appendChild(input);
      section.appendChild(row);
    });
    settingsBody.appendChild(section);
  });
}

function openSettings() {
  renderSettingsForm();
  settingsOverlay.hidden = false;
}

function closeSettings() {
  settingsOverlay.hidden = true;
}

function applySettingsForm() {
  const prevWsUrl = buildWsUrl();
  const prevCenter = CFG.CENTRAL_HOST;
  [...settingsBody.querySelectorAll('[data-key]')].forEach(input => {
    const key = input.dataset.key;
    const raw = input.type === 'checkbox' ? input.checked : input.value;
    applySettingValue(key, coerceSetting(key, raw));
  });
  layout = CFG.LAYOUT;
  renderLegend();
  syncFlowColors();
  syncNodeLabels();
  resize();
  syncNodeRoles();
  ensureCentralNode();
  updateLayoutButton();
  updateCenterSelect();
  relayout();
  if (prevCenter !== CFG.CENTRAL_HOST) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({type: 'set_center', host: CFG.CENTRAL_HOST}));
    } else {
      pushSystemLog(`center → ${CFG.CENTRAL_HOST}`);
    }
  }
  closeSettings();
  persistRuntimeSettings();
  if (socket && socket.readyState === WebSocket.OPEN && prevWsUrl !== buildWsUrl()) socket.close();
}

function resetSettingsForm() {
  Object.assign(CFG, DEFAULT_CFG);
  Object.assign(CFG, APP_CONFIG);
  Object.entries(DEFAULT_PROTO_COLORS).forEach(([proto, color]) => {
    PROTO[proto].c = color;
  });
  layout = CFG.LAYOUT;
  renderLegend();
  syncFlowColors();
  syncNodeLabels();
  renderSettingsForm();
}

function nodeRadius(n) {
  return n.central ? 11 : 5 + Math.min(10, Math.log10(Math.max(1, n.bps / 100)) * 4);
}

function isFlowHidden(f) {
  return hiddenHosts.has(f.src.ip) || hiddenHosts.has(f.dst.ip);
}

function placeCircle(group, radius, offset = 0) {
  const drawW = W - CFG.LOG_W;
  const count = group.length;
  if (!count) return;
  group.sort(byIp).forEach((n, i) => {
    const angle = -Math.PI / 2 + offset + (Math.PI * 2 * i) / count;
    const jitter = radius * (n.loc ? CFG.INNER_JITTER : CFG.OUTER_JITTER);
    const rr = radius + (unit(n.ip, 9) - 0.5) * jitter;
    n.x = clamp(CX + Math.cos(angle) * rr, 20, drawW - 20);
    n.y = clamp(CY + Math.sin(angle) * rr, 62, H - 20);
    n.side = Math.cos(angle) >= 0 ? 'right' : 'left';
  });
}

function placeColumn(group, x, side) {
  const top = 76;
  const bottom = H - 24;
  const count = group.length;
  if (!count) return;
  const step = (bottom - top) / (count + 1);
  group.sort(byIp).forEach((n, i) => {
    n.x = x;
    n.y = top + step * (i + 1);
    n.side = side;
  });
}

function relayout() {
  const drawW = W - CFG.LOG_W;
  const minDim = Math.min(drawW, H - 52) * 0.92;
  const center = nodes.get(CFG.CENTRAL_HOST);
  const locals = [...nodes.values()].filter(n => !n.central && n.loc);
  const externals = [...nodes.values()].filter(n => !n.central && !n.loc);
  if (center) {
    center.x = CX;
    center.y = CY;
    center.side = 'center';
  }
  if (layout === 'horizontal') {
    placeColumn(locals, CX - drawW * 0.28, 'left');
    placeColumn(externals, CX + drawW * 0.28, 'right');
  } else {
    placeCircle(locals, minDim * CFG.INNER_R_FRAC);
    placeCircle(externals, minDim * CFG.OUTER_R_FRAC, externals.length > 1 ? Math.PI / externals.length : 0);
  }
  flows.forEach(f => Object.assign(f, bezierCP(f.src, f.dst)));
}

function ensureCentralNode() {
  if (CFG.CENTRAL_HOST) getNode(CFG.CENTRAL_HOST);
}

function getNode(ip) {
  if (nodes.has(ip)) return nodes.get(ip);
  const central = ip === CFG.CENTRAL_HOST;
  const loc = central || isLocal(ip);
  const n = {ip, x: CX, y: CY, loc, central, side: 'center', label: ip, dnsName: '', pulses: [], activity: 0, bps: 0, _rawBytes: 0, lastSeen: Date.now(), lastProto: ''};
  nodes.set(ip, n);
  updateCenterSelect();
  relayout();
  return n;
}

function bezierCP(src, dst) {
  const mx = (src.x + dst.x) / 2, my = (src.y + dst.y) / 2;
  const dx = dst.x - src.x, dy = dst.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = (unit(`${src.ip}>${dst.ip}`, 3) - 0.5) * Math.min(len * CFG.BEZIER_CURVE, CFG.BEZIER_MAX_OFF);
  return {cpx: mx - dy / len * off, cpy: my + dx / len * off};
}

function processPacket(d) {
  ensureCentralNode();
  const proto = resolveProto(d.proto, d.sport, d.dport);
  const key = `${d.src}>${d.dst}>${proto}`;
  let f = flows.get(key);
  const packetBytes = d.len || 64;
  if (!f) {
    const src = getNode(d.src), dst = getNode(d.dst);
    const {cpx, cpy} = bezierCP(src, dst);
    f = {src, dst, cpx, cpy, proto, color: flowColor(proto), bps: 0, pps: 0, _rawPkts: 0, _rawBytes: 0, lastSeen: Date.now(), particles: [], _spawnDebt: 0};
    flows.set(key, f);
    spawnParticle(f, packetBytes / 0.016, 0.02);
  }
  f._rawPkts++;
  f._rawBytes += packetBytes;
  f.lastSeen = Date.now();
  f.src.activity = Math.min(1, f.src.activity + 0.12);
  f.dst.activity = Math.min(1, f.dst.activity + 0.06);
  f.src.lastSeen = Date.now();
  f.dst.lastSeen = Date.now();
  f.src._rawBytes += packetBytes;
  f.dst._rawBytes += packetBytes;
  if (!f.src.central) f.src.lastProto = proto;
  if (!f.dst.central) f.dst.lastProto = proto;
  statPkts++;
  statBytes += packetBytes;
  if (d.host_src && d.host_src !== d.src) {
    f.src.dnsName = d.host_src;
    if (CFG.SHOW_DNS_NAMES) f.src.label = d.host_src;
  }
  if (d.host_dst && d.host_dst !== d.dst) {
    f.dst.dnsName = d.host_dst;
    if (CFG.SHOW_DNS_NAMES) f.dst.label = d.host_dst;
  }
  if (isFlowHidden(f)) return;
  pushLog(`<span style="color:${f.color}">${proto.padEnd(4)}</span> ${f.src.label}:${(d.sport || '').toString().padEnd(5)} → ${f.dst.label}:${d.dport || ''}`);
}

function bezierPt(t, x0, y0, cx, cy, x1, y1) {
  const u = 1 - t;
  return {x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1};
}

function updateFlows(dt) {
  const now = Date.now();
  flows.forEach((f, k) => {
    f.pps = f.pps * CFG.SMOOTH_FLOW + (f._rawPkts / dt) * (1 - CFG.SMOOTH_FLOW);
    f.bps = f.bps * CFG.SMOOTH_FLOW + (f._rawBytes / dt) * (1 - CFG.SMOOTH_FLOW);
    f._rawPkts = 0;
    f._rawBytes = 0;
    if (now - f.lastSeen > CFG.FLOW_TTL) {
      flows.delete(k);
      return;
    }
    const spawnRate = Math.min(f.pps, CFG.MAX_SPAWN_RATE);
    f._spawnDebt += spawnRate * dt;
    while (f._spawnDebt >= 1 && f.particles.length < CFG.MAX_PARTICLES) {
      f._spawnDebt -= 1;
      spawnParticle(f, f.bps, 0);
    }
    if (f._spawnDebt > CFG.SPAWN_DEBT_CAP) f._spawnDebt = CFG.SPAWN_DEBT_CAP;
  });
}

function updateNodes(dt) {
  const now = Date.now();
  nodes.forEach((n, k) => {
    n.bps = n.bps * CFG.NODE_BPS_DECAY + (n._rawBytes / dt) * (1 - CFG.NODE_BPS_DECAY);
    n._rawBytes = 0;
    n.activity = Math.max(0, n.activity - CFG.NODE_ACTIVITY_DECAY);
    if (!n.central && now - n.lastSeen > CFG.NODE_TTL) nodes.delete(k);
  });
}

function drawBgCircles() {
  const drawW = W - CFG.LOG_W;
  const minDim = Math.min(drawW, H - 52) * 0.92;
  ctx.beginPath();
  ctx.arc(CX, CY, minDim * CFG.OUTER_R_FRAC, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(55,138,221,0.07)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(CX, CY, minDim * CFG.INNER_R_FRAC, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(29,158,117,0.09)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(239,159,39,0.30)';
  ctx.fillText('CENTER', CX, CY - 14);
  ctx.fillStyle = 'rgba(29,158,117,0.22)';
  ctx.fillText('LOCAL', CX, CY - minDim * CFG.INNER_R_FRAC - 7);
  ctx.fillStyle = 'rgba(55,138,221,0.18)';
  ctx.fillText('EXTERNAL', CX, CY - minDim * CFG.OUTER_R_FRAC - 7);
}

function drawBgColumns() {
  const drawW = W - CFG.LOG_W;
  const leftX = CX - drawW * 0.28, rightX = CX + drawW * 0.28;
  ctx.strokeStyle = 'rgba(55,138,221,0.08)';
  ctx.setLineDash([6, 10]);
  [leftX, CX, rightX].forEach(x => {
    ctx.beginPath();
    ctx.moveTo(x, 62);
    ctx.lineTo(x, H - 20);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(29,158,117,0.24)';
  ctx.fillText('LOCAL', leftX, 74);
  ctx.fillStyle = 'rgba(239,159,39,0.30)';
  ctx.fillText('CENTER', CX, 74);
  ctx.fillStyle = 'rgba(55,138,221,0.20)';
  ctx.fillText('EXTERNAL', rightX, 74);
}

function drawFlowLine(f) {
  const age = Date.now() - f.lastSeen;
  const freshness = Math.max(0, 1 - age / CFG.FLOW_TTL);
  const lw = Math.max(CFG.LINE_WIDTH_MIN, Math.min(CFG.LINE_WIDTH_MAX, CFG.LINE_WIDTH_MIN + Math.log10(Math.max(1, f.bps / 500)) * 0.8));
  const alpha = (CFG.LINE_ALPHA_BASE + freshness * 0.18) * Math.min(1, f.bps / 500 + 0.3);
  ctx.beginPath();
  ctx.moveTo(f.src.x, f.src.y);
  ctx.quadraticCurveTo(f.cpx, f.cpy, f.dst.x, f.dst.y);
  ctx.strokeStyle = f.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
  ctx.lineWidth = lw;
  ctx.stroke();
}

function drawParticles(f) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = f.particles.length - 1; i >= 0; i--) {
    const p = f.particles[i];
    p.t += p.speed;
    if (p.t >= 1) {
      f.particles.splice(i, 1);
      f.dst.pulses.push({r: 0, a: CFG.PULSE_INIT_ALPHA});
      continue;
    }
    const tTail = Math.max(0, p.t - CFG.TRAIL_T);
    const pts = [];
    for (let s = 0; s <= CFG.TRAIL_SAMPLES; s++) {
      const t = tTail + (p.t - tTail) * s / CFG.TRAIL_SAMPLES;
      pts.push(bezierPt(t, f.src.x, f.src.y, f.cpx, f.cpy, f.dst.x, f.dst.y));
    }
    for (let s = 0; s < CFG.TRAIL_SEGMENTS; s++) {
      const frac = (s + 1) / CFG.TRAIL_SEGMENTS;
      const ia = Math.round(s / CFG.TRAIL_SEGMENTS * CFG.TRAIL_SAMPLES);
      const ib = Math.round((s + 1) / CFG.TRAIL_SEGMENTS * CFG.TRAIL_SAMPLES);
      ctx.beginPath();
      ctx.moveTo(pts[ia].x, pts[ia].y);
      for (let j = ia + 1; j <= ib; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.strokeStyle = f.color + Math.round(frac * 180).toString(16).padStart(2, '0');
      ctx.lineWidth = p.sz * frac * 1.6;
      ctx.stroke();
    }
    const head = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(head.x, head.y, p.sz, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.fill();
  }
}

function drawNode(n) {
  const isCenter = n.central;
  const r = nodeRadius(n);
  const hidden = hiddenHosts.has(n.ip);
  const labelAlpha = clamp(CFG.NODE_LABEL_ALPHA_BASE + n.activity * CFG.NODE_LABEL_ALPHA_ACTIVITY, 0, 1);
  const strokeColor = isCenter ? '#EF9F27' : nodeColor(n);
  const rgb = hexToRgb(strokeColor);
  const pulseColor = isCenter ? '239,159,39' : `${rgb.r},${rgb.g},${rgb.b}`;
  n.pulses.forEach(p => {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + p.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${pulseColor},${p.a.toFixed(2)})`;
    ctx.lineWidth = isCenter ? 1.5 : 1;
    ctx.stroke();
    p.r += CFG.PULSE_SPEED;
    p.a -= CFG.PULSE_DECAY;
  });
  n.pulses = n.pulses.filter(p => p.a > 0);
  const alpha = (hidden ? 0.10 : 0.25) + n.activity * 0.55;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  if (isCenter) ctx.fillStyle = `rgba(239,159,39,${alpha})`;
  else ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = isCenter ? 2 : 1;
  ctx.stroke();
  if (hidden) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = `rgba(255,255,255,${labelAlpha})`;
  ctx.font = `${isCenter ? CFG.CENTER_LABEL_FONT_SIZE : CFG.NODE_LABEL_FONT_SIZE}px monospace`;
  if (isCenter) {
    ctx.textAlign = 'center';
    ctx.fillText(n.label, n.x, n.y + r + 13);
  } else if (layout === 'horizontal') {
    const pad = r + 10;
    const leftSide = n.side === 'left' || n.x < CX;
    ctx.textAlign = leftSide ? 'right' : 'left';
    ctx.fillText(n.label, n.x + (leftSide ? -pad : pad), n.y + 4);
  } else if (n.loc) {
    ctx.textAlign = 'center';
    ctx.fillText(n.label, n.x, n.y + r + 12);
  } else {
    const dx = n.x - CX, dy = n.y - CY, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const lx = n.x + (dx / dist) * (r + 10), ly = n.y + (dy / dist) * (r + 10) + 4;
    ctx.textAlign = dx > 20 ? 'left' : dx < -20 ? 'right' : 'center';
    ctx.fillText(n.label, lx, ly);
  }
}

function fmtBytes(b) {
  return b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${Math.round(b)} B`;
}

function draw() {
  const now = Date.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#07111e';
  ctx.fillRect(0, 0, W, H);
  layout === 'horizontal' ? drawBgColumns() : drawBgCircles();
  updateFlows(dt);
  updateNodes(dt);
  flows.forEach(f => { if (!isFlowHidden(f)) drawFlowLine(f); });
  flows.forEach(f => { if (!isFlowHidden(f)) drawParticles(f); });
  nodes.forEach(n => drawNode(n));
  ctx.restore();
  if (now - lastStatFlush >= 1000) {
    const elapsed = (now - lastStatFlush) / 1000;
    smoothPps = Math.round(statPkts / elapsed);
    smoothBps = statBytes / elapsed;
    statPkts = 0;
    statBytes = 0;
    lastStatFlush = now;
    updateStats();
  }
  requestAnimationFrame(draw);
}

function applyServerConfig(data) {
  const prevInterface = currentInterface;
  const prevCenter = CFG.CENTRAL_HOST;
  if (typeof data.central_host === 'string' && !hasStoredCfgOverride('CENTRAL_HOST')) CFG.CENTRAL_HOST = data.central_host;
  if (typeof data.layout === 'string' && !hasStoredCfgOverride('LAYOUT')) { layout = data.layout; CFG.LAYOUT = data.layout; }
  if (typeof data.ws_port === 'number' && !hasStoredCfgOverride('WS_PORT') && !hasStoredCfgOverride('WS_URL')) CFG.WS_PORT = data.ws_port;
  if (Array.isArray(data.interfaces)) availableInterfaces = data.interfaces;
  if (typeof data.interface === 'string') currentInterface = data.interface;
  syncNodeRoles();
  updateLayoutButton();
  updateInterfaceSelect();
  updateCenterSelect();
  if (prevInterface && currentInterface && prevInterface !== currentInterface) {
    resetScene(`interface → ${currentInterface}`);
  } else if (prevCenter && CFG.CENTRAL_HOST && prevCenter !== CFG.CENTRAL_HOST) {
    ensureCentralNode();
    relayout();
    pushSystemLog(`center → ${CFG.CENTRAL_HOST}`);
  } else {
    ensureCentralNode();
    relayout();
  }
  txt.textContent = currentInterface ? `live · ${currentInterface}` : 'live';
  syncSettingsPanel();
}

function applyServerError(data) {
  pushSystemLog(data.error || 'capture error');
  dot.className = 'dot';
  txt.textContent = currentInterface ? `capture error · ${currentInterface}` : 'capture error';
}

function buildWsUrl() {
  if (CFG.WS_URL) return CFG.WS_URL;
  const host = CFG.WS_HOST || location.hostname || '127.0.0.1';
  return `${CFG.WS_SCHEME}://${host}:${CFG.WS_PORT}`;
}

function connect() {
  const ws = new WebSocket(buildWsUrl());
  socket = ws;
  updateInterfaceSelect();
  ws.onopen = () => {
    dot.className = 'dot ok';
    txt.textContent = currentInterface ? `live · ${currentInterface}` : 'live';
    updateInterfaceSelect();
    updateCenterSelect();
    ws.send(JSON.stringify({type: 'get_config'}));
  };
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'config') applyServerConfig(msg);
      else if (msg.type === 'error') applyServerError(msg);
      else processPacket(msg);
    } catch (_) {}
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    dot.className = 'dot';
    txt.textContent = 'reconnecting…';
    updateInterfaceSelect();
    updateCenterSelect();
    setTimeout(connect, 3000);
  };
}

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { resize(); relayout(); }, 150);
});

document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

layoutBtn.addEventListener('click', () => {
  layout = layout === 'circle' ? 'horizontal' : 'circle';
  updateLayoutButton();
  relayout();
  persistRuntimeSettings();
  syncSettingsPanel();
});

fullscreenBtn.addEventListener('click', toggleFullscreen);
settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsApplyBtn.addEventListener('click', applySettingsForm);
settingsResetBtn.addEventListener('click', resetSettingsForm);
settingsOverlay.addEventListener('click', e => {
  if (e.target === settingsOverlay) closeSettings();
});

logPauseBtn.addEventListener('click', () => {
  logPaused = !logPaused;
  updateLogPauseButton();
  if (!logPaused) renderLog(true);
});

ifaceSelect.addEventListener('change', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!ifaceSelect.value || ifaceSelect.value === currentInterface) return;
  socket.send(JSON.stringify({type: 'set_interface', interface: ifaceSelect.value}));
  pushSystemLog(`switching to ${ifaceSelect.value}`);
});

centerSelect.addEventListener('blur', () => {
  if (_centerSelectPending) {
    _centerSelectPending = false;
    updateCenterSelect();
  }
});

centerSelect.addEventListener('change', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!centerSelect.value || centerSelect.value === CFG.CENTRAL_HOST) return;
  CFG.CENTRAL_HOST = centerSelect.value;
  syncNodeRoles();
  ensureCentralNode();
  updateCenterSelect();
  relayout();
  persistRuntimeSettings();
  socket.send(JSON.stringify({type: 'set_center', host: centerSelect.value}));
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
  const hit = [...nodes.values()].reverse().find(n => Math.hypot(x - n.x, y - n.y) <= nodeRadius(n) + 6);
  if (!hit) return;
  hiddenHosts.has(hit.ip) ? hiddenHosts.delete(hit.ip) : hiddenHosts.add(hit.ip);
});

function init() {
  renderLegend();
  resize();
  updateLayoutButton();
  updateFullscreenButton();
  updateLogPauseButton();
  updateInterfaceSelect();
  updateCenterSelect();
  ensureCentralNode();
  relayout();
  updateStats();
  connect();
  draw();
}

init();