import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "rotation.json");
const SERVER_UTC_OFFSET_HOURS = 3;

const blocks = ["BR", "INT"];
const statuses = ["pending", "confirmed", "corrected", "ffa", "enemy", "skipped", "bugged"];
const atlasInitialSpawn = "2026-06-27T11:40:00.000Z";

const bossSeed = [
  ["flower-corruption", "Flower of Corruption", "Novus Group B", 42, "fixed", "16:00", null, 20, true, null],
  ["mecha-wild-beast", "Mecha Wild Beast", "Novus Group B", 48, "fixed", "16:00", null, 26, true, null],
  ["mecha-optic-larva", "Mecha Optic Larva", "Novus Group B", 48, "fixed", "16:00", null, 26, true, null],
  ["rusty-sickle", "Rusty Sickle", "Novus Group B", 49, "fixed", "16:00", null, 27, true, null],
  ["mecha-lunker", "Mecha Lunker", "Novus Group C", 50, "fixed", "22:30", null, 45, true, null],
  ["mecha-lizard", "Mecha Lizard", "Novus Group C", 52, "fixed", "22:30", null, 47, true, null],
  ["mecha-temizl", "Mecha Temizl", "Novus Group C", 60, "fixed", "22:30", null, 55, true, null],
  ["prime-draco", "Prime Draco", "Novus Group C", 62, "fixed", "22:30", null, 57, true, null],
  ["mecha-tamac", "Mecha Tamac", "Novus Group D", 66, "interval", null, 42, 70, true, "DYNAMIC_D"],
  ["infernal-larva", "Infernal Larva", "Novus Group D", 67, "interval", null, 42, 71, true, "DYNAMIC_D"],
  ["locust", "Locust", "Novus Group D", 68, "interval", null, 42, 72, true, "DYNAMIC_D"],
  ["mecha-tweezer", "Mecha Tweezer", "Novus Group D", 70, "interval", null, 42, 74, true, "DYNAMIC_D"],
  ["vastus", "Vastus", "Novus Group D", 74, "interval", null, 42, 78, true, "DYNAMIC_D"],
  ["mecha-warbeast", "Mecha Warbeast", "Novus Group E", 76, "interval", null, 48, 95, false, null],
  ["mecha-ertelem", "Mecha Ertelem", "Novus Group E", 77, "interval", null, 48, 96, false, null],
  ["mecha-devourer", "Mecha Devourer", "Novus Group E", 79, "interval", null, 48, 98, false, null],
  ["hook", "Hook", "Novus Group E", 80, "interval", null, 48, 99, false, null],
  ["mecha-lapis", "Mecha Lapis", "Atlas Boss Group", 57, "interval", null, 60, 110, true, atlasInitialSpawn],
  ["mecha-silex", "Mecha Silex", "Atlas Boss Group", 59, "interval", null, 60, 112, true, atlasInitialSpawn],
  ["mecha-nyoka", "Mecha Nyoka", "Atlas Boss Group", 61, "interval", null, 60, 114, true, atlasInitialSpawn],
];

const guildSeed = [
  { id: "blood", name: "BLOOD", block: "BR", active: true, priority: 1.12 },
  { id: "mcdonalds", name: "McDonalds", block: "BR", active: true, priority: 1 },
  { id: "vendetta", name: "Vendetta", block: "BR", active: true, priority: 0.9 },
  { id: "bloodbrothers", name: "BloodBrothers", block: "INT", active: true, priority: 1 },
  { id: "titan", name: "Titan", block: "INT", active: true, priority: 1 },
  { id: "ironhands", name: "IronHands", block: "INT", active: true, priority: 1 },
];

function dGroupInitialSpawn() {
  return new Date(Date.now() + ((1 * 24 + 9) * 60 + 45) * 60 * 1000).toISOString();
}

function seedState() {
  const dSpawn = dGroupInitialSpawn();
  return {
    bosses: bossSeed.map(([id, name, group, level, spawnType, fixedTime, respawnHours, weight, active, initialNextAt]) => ({
      id,
      name,
      group,
      level,
      spawnType,
      fixedTime,
      respawnHours,
      weight,
      active,
      initialNextAt: initialNextAt === "DYNAMIC_D" ? dSpawn : initialNextAt,
    })),
    guilds: structuredClone(guildSeed),
    events: [],
  };
}

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) writeState(seedState());
}

function readState() {
  ensureData();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function publicBoss(boss) {
  const { weight, ...visible } = boss;
  return visible;
}

function publicGuild(guild) {
  const { priority, ...visible } = guild;
  return visible;
}

function publicState(state) {
  const scores = calculateScores(state);
  return {
    bosses: state.bosses.map(publicBoss),
    guilds: state.guilds.map(publicGuild),
    events: state.events,
    scores,
    statuses,
    blocks,
  };
}

function getBoss(state, id) {
  return state.bosses.find((boss) => boss.id === id);
}

function countedEvents(state, events = state.events) {
  return events.filter((event) => event.counted && event.realGuildId && event.realBlock && ["confirmed", "corrected"].includes(event.status));
}

function calculateScores(state, events = state.events) {
  const blockScores = { BR: 0, INT: 0 };
  const guildScores = Object.fromEntries(state.guilds.map((guild) => [guild.id, 0]));

  countedEvents(state, events).forEach((event) => {
    const boss = getBoss(state, event.bossId);
    const weight = boss ? Number(boss.weight) : 0;
    blockScores[event.realBlock] += weight;
    guildScores[event.realGuildId] = (guildScores[event.realGuildId] || 0) + weight;
  });

  return { blockScores, guildScores, countedEvents: countedEvents(state, events).length };
}

function addScore(scores, block, guildId, weight) {
  scores.blockScores[block] = (scores.blockScores[block] || 0) + Number(weight || 0);
  scores.guildScores[guildId] = (scores.guildScores[guildId] || 0) + Number(weight || 0);
}

function chooseBlock(scores) {
  return scores.blockScores.BR <= scores.blockScores.INT ? "BR" : "INT";
}

function chooseGuild(state, block, scores) {
  const guilds = state.guilds.filter((guild) => guild.active && guild.block === block);
  const totalPriority = guilds.reduce((sum, guild) => sum + Number(guild.priority), 0) || 1;
  const blockTotal = scores.blockScores[block] || 0;

  return guilds
    .map((guild) => {
      const target = blockTotal * (Number(guild.priority) / totalPriority);
      const current = scores.guildScores[guild.id] || 0;
      return { guild, deficit: target - current, current };
    })
    .sort((a, b) => b.deficit - a.deficit || a.current - b.current || a.guild.name.localeCompare(b.guild.name))[0]?.guild;
}

function suggestOwnerFromScores(state, scores) {
  const block = chooseBlock(scores);
  const guild = chooseGuild(state, block, scores);
  return { block, guild };
}

function serverDailyAt(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const now = new Date();
  const serverNow = new Date(now.getTime() - SERVER_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  let candidate = new Date(Date.UTC(
    serverNow.getUTCFullYear(),
    serverNow.getUTCMonth(),
    serverNow.getUTCDate(),
    hours + SERVER_UTC_OFFSET_HOURS,
    minutes,
    0,
    0
  ));
  if (candidate < now) candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  return candidate;
}

function addNextCandidate(state, candidates, existingKeys, latestByBoss, boss) {
  let next;
  if (boss.spawnType === "fixed") {
    next = latestByBoss[boss.id]
      ? new Date(new Date(latestByBoss[boss.id]).getTime() + 24 * 60 * 60 * 1000)
      : serverDailyAt(boss.fixedTime || "00:00");
  } else if (latestByBoss[boss.id]) {
    next = new Date(new Date(latestByBoss[boss.id]).getTime() + Number(boss.respawnHours || 0) * 60 * 60 * 1000);
  } else if (boss.initialNextAt) {
    next = new Date(boss.initialNextAt);
  } else {
    next = new Date(Date.now() + Number(boss.respawnHours || 0) * 60 * 60 * 1000);
  }

  while (existingKeys.has(`${boss.id}|${next.toISOString()}`)) {
    const stepHours = boss.spawnType === "fixed" ? 24 : Number(boss.respawnHours || 0);
    next = new Date(next.getTime() + stepHours * 60 * 60 * 1000);
  }
  candidates.push({ boss, spawnAt: next.toISOString() });
}

function recalculatePendingSuggestions(state) {
  const scores = { blockScores: { BR: 0, INT: 0 }, guildScores: Object.fromEntries(state.guilds.map((guild) => [guild.id, 0])) };
  state.events.sort((a, b) => a.spawnAt.localeCompare(b.spawnAt)).forEach((event) => {
    const boss = getBoss(state, event.bossId);
    const weight = boss ? Number(boss.weight) : 0;
    if (event.status === "pending") {
      const suggestion = suggestOwnerFromScores(state, scores);
      event.suggestedBlock = suggestion.block;
      event.suggestedGuildId = suggestion.guild?.id || "";
      if (suggestion.guild) addScore(scores, suggestion.block, suggestion.guild.id, weight);
      return;
    }
    if (event.counted && event.realBlock && event.realGuildId && ["confirmed", "corrected"].includes(event.status)) {
      addScore(scores, event.realBlock, event.realGuildId, weight);
    }
  });
}

function generateUpcoming(state, count = 24) {
  const activeBosses = state.bosses.filter((boss) => boss.active);
  const existingKeys = new Set(state.events.map((event) => `${event.bossId}|${event.spawnAt}`));
  const latestByBoss = Object.fromEntries(activeBosses.map((boss) => [boss.id, null]));

  state.events.forEach((event) => {
    if (!latestByBoss[event.bossId] || event.spawnAt > latestByBoss[event.bossId]) latestByBoss[event.bossId] = event.spawnAt;
  });

  const candidates = [];
  activeBosses.forEach((boss) => addNextCandidate(state, candidates, existingKeys, latestByBoss, boss));

  while (candidates.length < count && activeBosses.length) {
    candidates.sort((a, b) => a.spawnAt.localeCompare(b.spawnAt));
    const earliest = candidates.shift();
    candidates.push(earliest);
    existingKeys.add(`${earliest.boss.id}|${earliest.spawnAt}`);
    latestByBoss[earliest.boss.id] = earliest.spawnAt;
    addNextCandidate(state, candidates, existingKeys, latestByBoss, earliest.boss);
  }

  candidates.sort((a, b) => a.spawnAt.localeCompare(b.spawnAt));
  const simulationEvents = [...state.events].sort((a, b) => a.spawnAt.localeCompare(b.spawnAt));
  const created = candidates.slice(0, count).map(({ boss, spawnAt }) => {
    const suggestion = suggestOwnerFromScores(state, calculateScores(state, simulationEvents));
    const event = {
      id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      spawnAt,
      bossId: boss.id,
      suggestedBlock: suggestion.block,
      suggestedGuildId: suggestion.guild?.id || "",
      realBlock: "",
      realGuildId: "",
      status: "pending",
      counted: true,
      note: "",
    };
    simulationEvents.push({ ...event, realBlock: event.suggestedBlock, realGuildId: event.suggestedGuildId, status: "confirmed" });
    return event;
  });

  state.events.push(...created);
  state.events.sort((a, b) => a.spawnAt.localeCompare(b.spawnAt));
  return created;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.get("/api/state", (req, res) => {
  res.json(publicState(readState()));
});

app.post("/api/events/generate", (req, res) => {
  const state = readState();
  generateUpcoming(state, Number(req.body.count || 24));
  writeState(state);
  res.json(publicState(state));
});

app.patch("/api/events/:id", (req, res) => {
  const state = readState();
  const event = state.events.find((item) => item.id === req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found" });
  Object.assign(event, req.body);
  if (Object.prototype.hasOwnProperty.call(req.body, "realGuildId")) {
    const guild = state.guilds.find((item) => item.id === req.body.realGuildId);
    event.realBlock = guild?.block || "";
  }
  if (event.realGuildId && event.realGuildId !== event.suggestedGuildId && event.status === "confirmed") {
    event.status = "corrected";
  }
  recalculatePendingSuggestions(state);
  writeState(state);
  res.json(publicState(state));
});

app.patch("/api/bosses/:id", (req, res) => {
  const state = readState();
  const boss = state.bosses.find((item) => item.id === req.params.id);
  if (!boss) return res.status(404).json({ error: "Boss not found" });
  const allowed = ["level", "spawnType", "fixedTime", "respawnHours", "initialNextAt", "active"];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) boss[key] = req.body[key];
  });
  recalculatePendingSuggestions(state);
  writeState(state);
  res.json(publicState(state));
});

app.patch("/api/guilds/:id", (req, res) => {
  const state = readState();
  const guild = state.guilds.find((item) => item.id === req.params.id);
  if (!guild) return res.status(404).json({ error: "Guild not found" });
  const allowed = ["block", "active"];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) guild[key] = req.body[key];
  });
  recalculatePendingSuggestions(state);
  writeState(state);
  res.json(publicState(state));
});

app.post("/api/reset", (req, res) => {
  const state = seedState();
  writeState(state);
  res.json(publicState(state));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`RF Next Rotation running on http://localhost:${PORT}`);
});
