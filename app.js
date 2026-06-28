const THEME_KEY = "rf-next-rotation-theme";
const ADMIN_TOKEN_KEY = "rf-next-rotation-admin-token";
const ACTIVE_TAB_KEY = "rf-next-rotation-active-tab";

let state = { bosses: [], guilds: [], events: [], scores: { blockScores: { BR: 0, INT: 0 }, guildScores: {}, countedEvents: 0 }, statuses: [], blocks: [] };
let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401) clearAdmin();
    alert(response.status === 401 ? "Admin login required." : message);
    throw new Error(message);
  }
  state = await response.json();
  if (state.meta?.message) alert(state.meta.message);
  render();
}

async function adminLogin() {
  const password = prompt("Admin password");
  if (!password) return;
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    alert(await response.text());
    return;
  }
  const data = await response.json();
  adminToken = data.token;
  localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
  applyAdminMode();
}

function clearAdmin() {
  adminToken = "";
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  applyAdminMode();
}

function activeTabId() {
  return localStorage.getItem(ACTIVE_TAB_KEY) || "summary";
}

function setActiveTab(tabId) {
  document.querySelectorAll(".tab, .panel").forEach((item) => item.classList.remove("active"));
  const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
  const panel = document.querySelector(`#${tabId}`);
  if (!tab || !panel) return setActiveTab("summary");
  tab.classList.add("active");
  panel.classList.add("active");
  localStorage.setItem(ACTIVE_TAB_KEY, tabId);
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (item) => String(item).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : "";
}

function formatDateOnly(value) {
  return new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeOnly(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatCountdown(value) {
  const diff = new Date(value).getTime() - Date.now();
  const past = diff < 0;
  let seconds = Math.floor(Math.abs(diff) / 1000);
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, "0")}h`);
  parts.push(`${String(minutes).padStart(2, "0")}m`);
  return `${past ? "Overdue by " : "In "}${parts.join(" ")}`;
}

function getBoss(id) {
  return state.bosses.find((boss) => boss.id === id);
}

function getGuild(id) {
  return state.guilds.find((guild) => guild.id === id);
}

function countedEvents() {
  return state.scores.countedEvents || 0;
}

function updateEvent(id, patch) {
  return api(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

function updateBoss(id, patch) {
  return api(`/api/bosses/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

function updateGuild(id, patch) {
  return api(`/api/guilds/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

function generateUpcoming(count = 24) {
  return api("/api/events/generate", { method: "POST", body: JSON.stringify({ count }) });
}

function recalculateSuggestions() {
  return api("/api/events/recalculate", { method: "POST" });
}

function addAtlasSeedEvents() {
  return api("/api/events/add-atlas-seed", { method: "POST" });
}

function addBattleground1SundayEvents() {
  return api("/api/events/add-bg1-sunday", { method: "POST" });
}

function makeSelect(options, value, onChange, placeholder = "") {
  const select = document.createElement("select");
  if (placeholder) select.append(new Option(placeholder, ""));
  options.forEach((option) => select.append(new Option(option.label, option.value)));
  select.value = value || "";
  select.disabled = !isAdmin();
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function makeInput(type, value, onChange) {
  const input = document.createElement("input");
  input.type = type;
  input.value = type === "datetime-local" ? toLocalInputValue(value) : value ?? "";
  input.disabled = !isAdmin();
  if (type === "checkbox") {
    input.className = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => onChange(input.checked));
  } else {
    input.addEventListener("change", () => {
      const nextValue = type === "number" ? Number(input.value) : type === "datetime-local" ? fromLocalInputValue(input.value) : input.value;
      onChange(nextValue);
    });
  }
  return input;
}

function makeDateTimeStack(value, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "datetime-stack";
  const current = toLocalInputValue(value);
  const dateInput = makeInput("date", current.slice(0, 10), (date) => {
    onChange(fromLocalInputValue(`${date}T${current.slice(11, 16) || "00:00"}`));
  });
  const timeInput = makeInput("time", current.slice(11, 16), (time) => {
    onChange(fromLocalInputValue(`${current.slice(0, 10)}T${time}`));
  });
  wrap.append(dateInput, timeInput);
  return wrap;
}

function makeGuildButtons(row) {
  const wrap = document.createElement("div");
  wrap.className = "guild-buttons";
  state.guilds
    .filter((guild) => guild.active)
    .sort((a, b) => state.blocks.indexOf(a.block) - state.blocks.indexOf(b.block))
    .forEach((guild) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guild-choice${row.realGuildId === guild.id ? " active" : ""}`;
      button.style.setProperty("--guild-color", guildColor(guild.id));
      button.textContent = guild.name;
      button.title = `${guild.block} - ${guild.name}`;
      button.disabled = !isAdmin();
      button.addEventListener("click", () => updateEvent(row.id, { realGuildId: row.realGuildId === guild.id ? "" : guild.id }));
      wrap.append(button);
    });
  return wrap;
}

function guildColor(guildId) {
  return {
    blood: "#e5484d",
    mcdonalds: "#f6c343",
    vendetta: "#2f9e6d",
    bloodbrothers: "#8b5cf6",
    titan: "#3b82f6",
    ironhands: "#94a3b8",
  }[guildId] || "#49a7c7";
}

function makeTeamButtons(row) {
  const wrap = document.createElement("div");
  wrap.className = "team-buttons";
  state.blocks.forEach((block) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `team-choice${row.realBlock === block ? " active" : ""}`;
    button.textContent = block;
    button.disabled = !isAdmin();
    button.addEventListener("click", () => updateEvent(row.id, { realBlock: row.realBlock === block ? "" : block }));
    wrap.append(button);
  });
  return wrap;
}

function groupKey(group) {
  if (group === "Atlas Boss Group") return "atlas";
  if (group.includes("Group B")) return "b";
  if (group.includes("Group C")) return "c";
  if (group.includes("Group D")) return "d";
  if (group.includes("Group E")) return "e";
  return "other";
}

function levelHue(row) {
  const boss = row.bossId ? getBoss(row.bossId) : row;
  if (!boss) return 132;
  if (boss.group === "Atlas Boss Group") return 268;
  const groupBosses = state.bosses.filter((item) => item.group === boss.group);
  const min = Math.min(...groupBosses.map((item) => Number(item.level)));
  const max = Math.max(...groupBosses.map((item) => Number(item.level)));
  const ratio = max === min ? 0 : (Number(boss.level) - min) / (max - min);
  return Math.round(132 - ratio * 128);
}

function levelChip(row) {
  const boss = row.bossId ? getBoss(row.bossId) : row;
  const chip = document.createElement("span");
  chip.className = "level-chip";
  chip.style.setProperty("--level-hue", levelHue(row));
  chip.textContent = `Lv ${boss?.level ?? "-"}`;
  return chip;
}

function spawnTimeDisplay(value) {
  const wrap = document.createElement("div");
  wrap.className = "spawn-time";
  const date = document.createElement("span");
  date.className = "spawn-date";
  date.textContent = formatDateOnly(value);
  const clock = document.createElement("span");
  clock.className = "spawn-clock";
  clock.textContent = formatTimeOnly(value);
  const countdown = document.createElement("span");
  countdown.className = "spawn-countdown";
  if (new Date(value).getTime() < Date.now()) countdown.classList.add("elapsed");
  countdown.textContent = formatCountdown(value);
  wrap.append(date, clock, countdown);
  return wrap;
}

function groupBadge(group) {
  const badge = document.createElement("span");
  badge.className = "group-badge";
  badge.textContent = group;
  return badge;
}

function renderTable(container, columns, rows) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const boss = row.bossId ? getBoss(row.bossId) : row.group ? row : null;
    if (boss?.group) tr.classList.add(`group-${groupKey(boss.group)}`);
    if (row.startsGroup) tr.classList.add("group-divider");
    columns.forEach((column) => {
      const td = document.createElement("td");
      const content = column.render(row);
      if (content instanceof Node) td.append(content);
      else td.textContent = content;
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  container.append(wrap);
}

function withGroupDividers(rows, getGroup) {
  let previousGroup = "";
  return rows.map((row) => {
    const currentGroup = getGroup(row);
    const startsGroup = Boolean(previousGroup && currentGroup !== previousGroup);
    previousGroup = currentGroup;
    return { ...row, startsGroup };
  });
}

function renderSummary() {
  const root = document.querySelector("#summary");
  root.innerHTML = `<div class="section-head"><div><h2>Summary</h2><p>Only counted events with confirmed real loot affect the rotation.</p></div><div class="time-note">Times shown in your PC timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || "local"}</div></div>`;
  const { blockScores, guildScores } = state.scores;
  const total = blockScores.BR + blockScores.INT;
  const diff = total ? Math.abs(blockScores.BR - blockScores.INT) / total * 100 : 0;
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  [
    ["BR points", blockScores.BR.toFixed(0)],
    ["INT points", blockScores.INT.toFixed(0)],
    ["BR/INT gap", `${diff.toFixed(1)}%`],
    ["Counted events", countedEvents()],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "metric";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    metrics.append(item);
  });
  root.append(metrics);

  const rows = state.guilds.map((guild) => ({ ...guild, score: guildScores[guild.id] || 0 }))
    .sort((a, b) => a.block.localeCompare(b.block) || a.score - b.score);
  renderTable(root, [
    { label: "Guild", render: (row) => row.name },
    { label: "Block", render: (row) => row.block },
    { label: "Points", render: (row) => row.score.toFixed(0) },
    { label: "Position", render: (row) => {
      const blockGuilds = rows.filter((guild) => guild.block === row.block);
      const avg = blockGuilds.reduce((sum, guild) => sum + guild.score, 0) / blockGuilds.length;
      if (row.score < avg * 0.95) return "behind";
      if (row.score > avg * 1.05) return "ahead";
      return "balanced";
    }},
  ], rows);
}

function renderNext() {
  const root = document.querySelector("#next");
  root.innerHTML = `<div class="section-head"><div><h2>Upcoming</h2><p>Generate future events and assign owners from the current real loot history.</p></div></div>`;
  if (isAdmin()) {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Generate upcoming events";
    button.addEventListener("click", () => generateUpcoming(24));
    const recalcButton = document.createElement("button");
    recalcButton.type = "button";
    recalcButton.textContent = "Recalculate suggestions";
    recalcButton.addEventListener("click", recalculateSuggestions);
    toolbar.append(button);
    toolbar.append(recalcButton);
    root.append(toolbar);
  }
  renderEventsTable(root, state.events.filter((event) => event.status === "pending" && new Date(event.spawnAt) > new Date()).slice(0, 30));
}

function renderEvents() {
  const root = document.querySelector("#events");
  root.innerHTML = `<div class="section-head"><div><h2>Events</h2><p>Set the real looter here. Corrections become the source of truth for future suggestions.</p></div></div>`;
  if (isAdmin()) {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const atlasButton = document.createElement("button");
    atlasButton.type = "button";
    atlasButton.textContent = "Add Atlas 08:40 events";
    atlasButton.addEventListener("click", () => addAtlasSeedEvents());
    const bg1Button = document.createElement("button");
    bg1Button.type = "button";
    bg1Button.textContent = "Add BG1 Sunday 13:00";
    bg1Button.addEventListener("click", () => addBattleground1SundayEvents());
    toolbar.append(atlasButton);
    toolbar.append(bg1Button);
    root.append(toolbar);
  }
  const now = new Date();
  const rows = state.events
    .filter((event) => new Date(event.spawnAt) <= now)
    .sort((a, b) => b.spawnAt.localeCompare(a.spawnAt));
  renderEventsTable(root, rows);
}

function renderEventsTable(root, events) {
  if (!events.length) {
    root.append(document.querySelector("#emptyState").content.cloneNode(true));
    return;
  }
  renderTable(root, [
    { label: "Spawn", render: (row) => makeDateTimeStack(row.spawnAt, (value) => updateEvent(row.id, { spawnAt: value })) },
    { label: "Respawn", render: (row) => spawnTimeDisplay(row.spawnAt) },
    { label: "Boss", render: (row) => getBoss(row.bossId)?.name || row.bossId },
    { label: "Level", render: (row) => levelChip(row) },
    { label: "Group", render: (row) => groupBadge(getBoss(row.bossId)?.group || "-") },
    { label: "Suggested", render: (row) => `${row.suggestedBlock} - ${getGuild(row.suggestedGuildId)?.name || "-"}` },
    { label: "Real team", render: (row) => makeTeamButtons(row) },
    { label: "Real loot", render: (row) => makeGuildButtons(row) },
    { label: "Status", render: (row) => makeSelect(state.statuses.map((status) => ({ label: titleCase(status), value: status })), row.status, (value) => updateEvent(row.id, { status: value })) },
    { label: "Count", render: (row) => makeInput("checkbox", row.counted, (value) => updateEvent(row.id, { counted: value })) },
    { label: "Note", render: (row) => {
      const input = document.createElement("textarea");
      input.value = row.note || "";
      input.disabled = !isAdmin();
      input.addEventListener("change", () => updateEvent(row.id, { note: input.value }));
      return input;
    }},
  ], withGroupDividers(events, (event) => getBoss(event.bossId)?.group || ""));
}

function renderBosses() {
  const root = document.querySelector("#bosses");
  root.innerHTML = `<div class="section-head"><div><h2>Bosses</h2><p>Weights stay hidden on the server.</p></div></div>`;
  const rows = [...state.bosses].sort((a, b) => a.group.localeCompare(b.group) || a.level - b.level);
  renderTable(root, [
    { label: "Boss", render: (row) => row.name },
    { label: "Group", render: (row) => groupBadge(row.group) },
    { label: "Lv", render: (row) => {
      const wrap = document.createElement("div");
      wrap.className = "toolbar";
      wrap.append(levelChip(row));
      wrap.append(makeInput("number", row.level, (value) => updateBoss(row.id, { level: value })));
      return wrap;
    }},
    { label: "Spawn", render: (row) => makeSelect([{ label: "fixed", value: "fixed" }, { label: "interval", value: "interval" }], row.spawnType, (value) => updateBoss(row.id, { spawnType: value })) },
    { label: "Fixed time", render: (row) => makeInput("time", row.fixedTime || "", (value) => updateBoss(row.id, { fixedTime: value })) },
    { label: "Respawn h", render: (row) => makeInput("number", row.respawnHours || "", (value) => updateBoss(row.id, { respawnHours: value })) },
    { label: "Initial next", render: (row) => makeInput("datetime-local", row.initialNextAt || "", (value) => updateBoss(row.id, { initialNextAt: value })) },
    { label: "Active", render: (row) => makeInput("checkbox", row.active, (value) => updateBoss(row.id, { active: value })) },
  ], withGroupDividers(rows, (boss) => boss.group));
}

function renderGuilds() {
  const root = document.querySelector("#guilds");
  root.innerHTML = `<div class="section-head"><div><h2>Guilds</h2><p>Internal priority stays hidden on the server.</p></div></div>`;
  renderTable(root, [
    { label: "Guild", render: (row) => row.name },
    { label: "Block", render: (row) => makeSelect(state.blocks.map((block) => ({ label: block, value: block })), row.block, (value) => updateGuild(row.id, { block: value })) },
    { label: "Active", render: (row) => makeInput("checkbox", row.active, (value) => updateGuild(row.id, { active: value })) },
  ], state.guilds);
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function render() {
  renderSummary();
  renderNext();
  renderEvents();
  renderBosses();
  renderGuilds();
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.querySelector("#themeBtn").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem(THEME_KEY, theme);
}

function isAdmin() {
  return Boolean(adminToken);
}

function applyAdminMode() {
  document.body.classList.toggle("admin", isAdmin());
  document.querySelector("#adminBtn").style.display = isAdmin() ? "none" : "inline-flex";
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.tab);
  });
});

document.querySelector("#themeBtn").addEventListener("click", () => {
  applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
});

document.querySelector("#adminBtn").addEventListener("click", adminLogin);
document.querySelector("#logoutBtn").addEventListener("click", clearAdmin);

document.querySelector("#seedBtn").addEventListener("click", () => {
  if (confirm("Reset seed data and delete saved events?")) api("/api/reset", { method: "POST" });
});

document.querySelector("#exportBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
  alert("Visible JSON copied to clipboard.");
});

applyTheme(localStorage.getItem(THEME_KEY) || "light");
applyAdminMode();
setActiveTab(activeTabId());
api("/api/state");
setInterval(() => render(), 30000);
