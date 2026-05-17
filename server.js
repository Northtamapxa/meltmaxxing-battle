const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const admin = require("firebase-admin");

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require("./serviceAccountKey.json");

if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const MATCH_MS = 15000;
const queues = { normal: [], ranked: [] };
const privateRooms = new Map();
const liveRooms = new Map();
const clients = new Set();
let onlineCount = 0;

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  clients.forEach(ws => send(ws, data));
}

function safeName(name) {
  return String(name || "Player").replace(/[<>]/g, "").trim().slice(0, 20) || "Player";
}

function cleanCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function makeCode() {
  let code;
  do {
    code = Math.random().toString(36).slice(2, 7).toUpperCase();
  } while (privateRooms.has(code) || liveRooms.has(code));
  return code;
}

function getRank(elo) {
  if (elo >= 1850) return "Legend";
  if (elo >= 1600) return "Diamond";
  if (elo >= 1400) return "Platinum";
  if (elo >= 1200) return "Gold";
  if (elo >= 1000) return "Silver";
  return "Bronze";
}

function getLevel(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isOpen(ws) {
  return ws && ws.readyState === WebSocket.OPEN;
}

function removeFromQueues(ws) {
  queues.normal = queues.normal.filter(p => p !== ws);
  queues.ranked = queues.ranked.filter(p => p !== ws);
}

function removePrivateHost(ws) {
  for (const [code, lobby] of privateRooms.entries()) {
    if (lobby.host === ws) privateRooms.delete(code);
  }
}

function opponent(ws) {
  if (!ws.room) return null;
  return ws.room.a === ws ? ws.room.b : ws.room.a;
}

async function getProfile(name, fallbackElo = 1000) {
  const ref = db.collection("profiles").doc(name);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      name,
      elo: fallbackElo,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      xp: 0,
      level: 1,
      streak: 0,
      lastPlayed: null,
      bestScore: 0,
      rank: getRank(fallbackElo),
    };
  }

  const data = snap.data();
  return {
    name,
    elo: Number(data.elo || fallbackElo),
    wins: Number(data.wins || 0),
    losses: Number(data.losses || 0),
    draws: Number(data.draws || 0),
    matches: Number(data.matches || 0),
    xp: Number(data.xp || 0),
    level: Number(data.level || 1),
    streak: Number(data.streak || 0),
    lastPlayed: data.lastPlayed || null,
    bestScore: Number(data.bestScore || 0),
    rank: data.rank || getRank(Number(data.elo || fallbackElo)),
  };
}

async function saveProfile(profile) {
  const xp = Number(profile.xp || 0);
  profile.level = getLevel(xp);
  profile.rank = getRank(Number(profile.elo || 1000));
  profile.updated = Date.now();

  await db.collection("profiles").doc(profile.name).set(profile, { merge: true });
  await db.collection("leaderboard").doc(profile.name).set({
    name: profile.name,
    elo: profile.elo,
    rank: profile.rank,
    level: profile.level,
    wins: profile.wins || 0,
    updated: Date.now(),
  }, { merge: true });
}

async function getLeaderboard() {
  const snap = await db.collection("leaderboard").orderBy("elo", "desc").limit(10).get();
  return snap.docs.map(d => ({ ...d.data(), rank: getRank(Number(d.data().elo || 0)) }));
}

async function broadcastLeaderboard() {
  const leaderboard = await getLeaderboard();
  broadcast({ type: "leaderboard", leaderboard });
}

function broadcastOnline() {
  broadcast({ type: "online", count: onlineCount });
}

function rankedChange(playerElo, opponentElo, result) {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
  return Math.round(32 * (result - expected));
}

async function applyStats(ws, result, score, opponentElo, mode) {
  const profile = await getProfile(ws.name, ws.elo);
  const today = todayKey();
  const yesterday = yesterdayKey();

  profile.matches = Number(profile.matches || 0) + 1;
  profile.bestScore = Math.max(Number(profile.bestScore || 0), Number(score || 0));

  if (result === "win") profile.wins = Number(profile.wins || 0) + 1;
  else if (result === "loss") profile.losses = Number(profile.losses || 0) + 1;
  else profile.draws = Number(profile.draws || 0) + 1;

  if (profile.lastPlayed === today) {
    profile.streak = Number(profile.streak || 1);
  } else if (profile.lastPlayed === yesterday) {
    profile.streak = Number(profile.streak || 0) + 1;
  } else {
    profile.streak = 1;
  }
  profile.lastPlayed = today;

  const xpGain = result === "win" ? 120 : result === "draw" ? 70 : 45;
  profile.xp = Number(profile.xp || 0) + xpGain + Math.round(Number(score || 0) * 5);

  if (mode === "ranked") {
    const scoreResult = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
    profile.elo = Math.max(0, Number(profile.elo || ws.elo) + rankedChange(Number(profile.elo || ws.elo), opponentElo, scoreResult));
    ws.elo = profile.elo;
  }

  await saveProfile(profile);
  return profile;
}

function notifySpectators(room, payload) {
  room.spectators.forEach(s => send(s, payload));
}

function setSocketState(ws, state) {
  ws.state = state;
  send(ws, { type: "state", state });
}

function startMatch(a, b, mode, code = null) {
  if (!isOpen(a) || !isOpen(b) || a === b) return null;

  removeFromQueues(a);
  removeFromQueues(b);
  removePrivateHost(a);
  removePrivateHost(b);

  const id = code || makeCode();
  const room = {
    id,
    mode,
    a,
    b,
    aScore: 0,
    bScore: 0,
    aRating: "",
    bRating: "",
    finished: false,
    startedAt: Date.now(),
    spectators: new Set(),
    timer: null,
  };

  a.room = room;
  b.room = room;
  liveRooms.set(id, room);
  setSocketState(a, "matched");
  setSocketState(b, "matched");

  const base = { type: "match", mode, roomId: id, durationMs: MATCH_MS, startedAt: room.startedAt };
  send(a, { ...base, initiator: true, opponentName: b.name, opponentElo: b.elo });
  send(b, { ...base, initiator: false, opponentName: a.name, opponentElo: a.elo });

  room.timer = setTimeout(() => finishRoom(room), MATCH_MS + 650);
  return room;
}

function matchQueue(mode) {
  queues[mode] = queues[mode].filter(ws => isOpen(ws) && !ws.room && ws.state === "queued");
  if (queues[mode].length < 2) return;

  const a = queues[mode].shift();
  const b = queues[mode].shift();
  startMatch(a, b, mode);
}

async function finishRoom(room, reason = "timer") {
  if (!room || room.finished) return;
  room.finished = true;
  if (room.timer) clearTimeout(room.timer);

  const aStillHere = isOpen(room.a);
  const bStillHere = isOpen(room.b);

  let aWin = room.aScore > room.bScore;
  let bWin = room.bScore > room.aScore;

  if (!aStillHere && bStillHere) {
    aWin = false;
    bWin = true;
  }
  if (!bStillHere && aStillHere) {
    aWin = true;
    bWin = false;
  }

  const aResult = aWin ? "win" : bWin ? "loss" : "draw";
  const bResult = bWin ? "win" : aWin ? "loss" : "draw";

  let aProfile = null;
  let bProfile = null;

  try {
    if (aStillHere) aProfile = await applyStats(room.a, aResult, room.aScore, room.b.elo, room.mode);
    if (bStillHere) bProfile = await applyStats(room.b, bResult, room.bScore, room.a.elo, room.mode);
    await broadcastLeaderboard();
  } catch (err) {
    console.error("finishRoom stats error:", err);
  }

  send(room.a, {
    type: "result",
    reason,
    result: aResult,
    win: aWin,
    draw: !aWin && !bWin,
    elo: aProfile ? aProfile.elo : room.a.elo,
    profile: aProfile,
    yourScore: room.aScore,
    opponentScore: room.bScore,
  });

  send(room.b, {
    type: "result",
    reason,
    result: bResult,
    win: bWin,
    draw: !aWin && !bWin,
    elo: bProfile ? bProfile.elo : room.b.elo,
    profile: bProfile,
    yourScore: room.bScore,
    opponentScore: room.aScore,
  });

  notifySpectators(room, { type: "spectateResult", a: room.a.name, b: room.b.name, aScore: room.aScore, bScore: room.bScore, reason });

  if (room.a) {
    room.a.room = null;
    if (isOpen(room.a)) setSocketState(room.a, "idle");
  }
  if (room.b) {
    room.b.room = null;
    if (isOpen(room.b)) setSocketState(room.b, "idle");
  }
  room.spectators.forEach(s => { s.spectating = null; });
  liveRooms.delete(room.id);
}

wss.on("connection", async ws => {
  clients.add(ws);
  onlineCount++;

  ws.name = "Player";
  ws.elo = 1000;
  ws.room = null;
  ws.mode = null;
  ws.spectating = null;
  ws.state = "idle";
  ws.isAlive = true;

  try {
    send(ws, { type: "leaderboard", leaderboard: await getLeaderboard() });
  } catch (err) {
    console.error("leaderboard error:", err);
  }
  broadcastOnline();
  setSocketState(ws, "idle");

  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", async raw => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "loadProfile") {
      ws.name = safeName(data.name);
      const profile = await getProfile(ws.name, Number(data.elo || 1000));
      ws.elo = profile.elo;
      send(ws, { type: "profile", profile });
      return;
    }

    if (data.type === "join") {
      if (ws.room) await finishRoom(ws.room, "requeue");
      removeFromQueues(ws);
      removePrivateHost(ws);

      ws.name = safeName(data.name);
      const profile = await getProfile(ws.name, Number(data.elo || 1000));
      ws.elo = profile.elo;
      ws.mode = data.mode === "ranked" ? "ranked" : "normal";
      setSocketState(ws, "queued");

      queues[ws.mode].push(ws);
      send(ws, { type: "waiting", mode: ws.mode });
      matchQueue(ws.mode);
      return;
    }

    if (data.type === "createPrivate") {
      if (ws.room) await finishRoom(ws.room, "private-room-created");
      removeFromQueues(ws);
      removePrivateHost(ws);

      ws.name = safeName(data.name);
      const profile = await getProfile(ws.name, Number(data.elo || 1000));
      ws.elo = profile.elo;
      const code = makeCode();
      privateRooms.set(code, { host: ws, mode: data.mode === "ranked" ? "ranked" : "normal", createdAt: Date.now() });
      setSocketState(ws, "privateWaiting");
      send(ws, { type: "privateCreated", code });
      return;
    }

    if (data.type === "joinPrivate") {
      if (ws.room) await finishRoom(ws.room, "join-private");
      removeFromQueues(ws);

      ws.name = safeName(data.name);
      const profile = await getProfile(ws.name, Number(data.elo || 1000));
      ws.elo = profile.elo;
      const code = cleanCode(data.code);
      const lobby = privateRooms.get(code);
      if (!lobby || !isOpen(lobby.host) || lobby.host === ws) {
        send(ws, { type: "errorMessage", message: "Room code not found." });
        return;
      }
      privateRooms.delete(code);
      startMatch(lobby.host, ws, lobby.mode, code);
      return;
    }

    if (data.type === "spectate") {
      const code = cleanCode(data.code);
      const room = liveRooms.get(code);
      if (!room || room.finished) {
        send(ws, { type: "errorMessage", message: "Live room not found." });
        return;
      }
      ws.spectating = room;
      room.spectators.add(ws);
      setSocketState(ws, "spectating");
      send(ws, { type: "spectating", code, a: room.a.name, b: room.b.name, mode: room.mode, durationMs: MATCH_MS, startedAt: room.startedAt });
      send(ws, { type: "spectateScore", aScore: room.aScore, bScore: room.bScore, aRating: room.aRating, bRating: room.bRating });
      return;
    }

    if (data.type === "cancelQueue") {
      removeFromQueues(ws);
      removePrivateHost(ws);
      setSocketState(ws, "idle");
      send(ws, { type: "cancelled" });
      return;
    }

    if (["offer", "answer", "ice"].includes(data.type)) {
      const opp = opponent(ws);
      if (opp) send(opp, data);
      return;
    }

    if (data.type === "score" && ws.room && !ws.room.finished) {
      const score = Math.max(0, Math.min(10, Number(data.score || 0)));
      const rating = String(data.rating || "").slice(0, 30);
      if (ws.room.a === ws) {
        ws.room.aScore = score;
        ws.room.aRating = rating;
      } else {
        ws.room.bScore = score;
        ws.room.bRating = rating;
      }
      send(opponent(ws), { type: "opponentScore", score, rating });
      notifySpectators(ws.room, { type: "spectateScore", aScore: ws.room.aScore, bScore: ws.room.bScore, aRating: ws.room.aRating, bRating: ws.room.bRating });
      return;
    }

    if (data.type === "chat" && ws.room && !ws.room.finished) {
      const message = String(data.message || "").replace(/[<>]/g, "").trim().slice(0, 120);
      if (!message) return;
      const payload = { type: "chat", name: ws.name, message, at: Date.now() };
      send(ws, payload);
      send(opponent(ws), payload);
      notifySpectators(ws.room, payload);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    onlineCount = Math.max(0, onlineCount - 1);
    removeFromQueues(ws);
    removePrivateHost(ws);
    if (ws.spectating) ws.spectating.spectators.delete(ws);

    const room = ws.room;
    const opp = opponent(ws);
    send(opp, { type: "opponentLeft" });
    if (room && !room.finished) finishRoom(room, "disconnect");

    broadcastOnline();
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, lobby] of privateRooms.entries()) {
    if (!isOpen(lobby.host) || now - lobby.createdAt > 5 * 60 * 1000) privateRooms.delete(code);
  }

  ["normal", "ranked"].forEach(mode => {
    queues[mode] = queues[mode].filter(ws => isOpen(ws) && !ws.room && ws.state === "queued");
    matchQueue(mode);
  });

  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`MeltMaxxing Battle running on port ${PORT}`));
