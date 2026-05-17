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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const queues = { normal: [], ranked: [] };
const clients = new Set();
let onlineCount = 0;

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function safeName(name) {
  return String(name || "Player")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 20) || "Player";
}

function getRank(elo) {
  if (elo >= 1700) return "Legend";
  if (elo >= 1450) return "Diamond";
  if (elo >= 1250) return "Platinum";
  if (elo >= 1100) return "Gold";
  if (elo >= 950) return "Silver";
  return "Bronze";
}

async function getLeaderboard() {
  const snap = await db.collection("leaderboard").orderBy("elo", "desc").limit(10).get();
  return snap.docs.map(d => ({ ...d.data(), rank: getRank(Number(d.data().elo || 0)) }));
}

async function broadcastLeaderboard() {
  const leaderboard = await getLeaderboard();
  clients.forEach(c => send(c, { type: "leaderboard", leaderboard }));
}

function broadcastOnline() {
  clients.forEach(c => send(c, { type: "online", count: onlineCount }));
}

function opponent(ws) {
  if (!ws.room) return null;
  return ws.room.a === ws ? ws.room.b : ws.room.a;
}

function removeFromQueues(ws) {
  queues.normal = queues.normal.filter(p => p !== ws);
  queues.ranked = queues.ranked.filter(p => p !== ws);
}

function match(mode) {
  if (queues[mode].length < 2) return;

  const a = queues[mode].shift();
  const b = queues[mode].shift();

  const room = {
    id: Math.random().toString(36).slice(2, 9),
    mode,
    a,
    b,
    aScore: 0,
    bScore: 0,
    finished: false,
    startedAt: Date.now(),
  };

  a.room = room;
  b.room = room;

  send(a, { type: "match", mode, roomId: room.id, initiator: true, opponentName: b.name, opponentElo: b.elo });
  send(b, { type: "match", mode, roomId: room.id, initiator: false, opponentName: a.name, opponentElo: a.elo });
}

async function finishRoom(room) {
  if (!room || room.finished) return;
  room.finished = true;

  const aWin = room.aScore > room.bScore;
  const bWin = room.bScore > room.aScore;

  if (room.mode === "ranked") {
    const change = 25;

    if (aWin) {
      room.a.elo += change;
      room.b.elo -= change;
    } else if (bWin) {
      room.b.elo += change;
      room.a.elo -= change;
    }

    room.a.elo = Math.max(0, room.a.elo);
    room.b.elo = Math.max(0, room.b.elo);

    await db.collection("leaderboard").doc(room.a.name).set({
      name: room.a.name,
      elo: room.a.elo,
      rank: getRank(room.a.elo),
      updated: Date.now(),
    }, { merge: true });

    await db.collection("leaderboard").doc(room.b.name).set({
      name: room.b.name,
      elo: room.b.elo,
      rank: getRank(room.b.elo),
      updated: Date.now(),
    }, { merge: true });

    await broadcastLeaderboard();
  }

  send(room.a, {
    type: "result",
    win: aWin,
    draw: !aWin && !bWin,
    elo: room.a.elo,
    yourScore: room.aScore,
    opponentScore: room.bScore,
  });

  send(room.b, {
    type: "result",
    win: bWin,
    draw: !aWin && !bWin,
    elo: room.b.elo,
    yourScore: room.bScore,
    opponentScore: room.aScore,
  });

  room.a.room = null;
  room.b.room = null;
}

wss.on("connection", async ws => {
  clients.add(ws);
  onlineCount++;

  ws.name = "Player";
  ws.elo = 1000;
  ws.room = null;
  ws.mode = null;
  ws.isAlive = true;

  send(ws, { type: "leaderboard", leaderboard: await getLeaderboard() });
  broadcastOnline();

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", async raw => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    if (data.type === "join") {
      removeFromQueues(ws);

      ws.name = safeName(data.name);
      ws.elo = Number(data.elo || 1000);
      ws.mode = data.mode === "ranked" ? "ranked" : "normal";

      queues[ws.mode].push(ws);
      send(ws, { type: "waiting", mode: ws.mode });
      match(ws.mode);
    }

    if (data.type === "cancelQueue") {
      removeFromQueues(ws);
      send(ws, { type: "cancelled" });
    }

    if (["offer", "answer", "ice"].includes(data.type)) {
      send(opponent(ws), data);
    }

    if (data.type === "score" && ws.room) {
      const score = Math.max(0, Math.min(10, Number(data.score || 0)));
      const rating = String(data.rating || "").slice(0, 30);

      if (ws.room.a === ws) ws.room.aScore = score;
      else ws.room.bScore = score;

      send(opponent(ws), { type: "opponentScore", score, rating });
    }

    if (data.type === "chat" && ws.room) {
      const message = String(data.message || "").replace(/[<>]/g, "").trim().slice(0, 120);
      if (!message) return;
      const payload = { type: "chat", name: ws.name, message, at: Date.now() };
      send(ws, payload);
      send(opponent(ws), payload);
    }

    if (data.type === "finish" && ws.room) {
      await finishRoom(ws.room);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    onlineCount = Math.max(0, onlineCount - 1);
    removeFromQueues(ws);

    const opp = opponent(ws);
    send(opp, { type: "opponentLeft" });
    if (opp) opp.room = null;

    broadcastOnline();
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MeltMaxxing Battle running on port ${PORT}`);
});
