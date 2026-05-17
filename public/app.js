const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const myScoreEl = document.getElementById("myScore");
const oppScoreEl = document.getElementById("oppScore");
const eloEl = document.getElementById("elo");
const statusEl = document.getElementById("status");
const leaderboardEl = document.getElementById("leaderboard");
const nameInput = document.getElementById("nameInput");
const onlineCountEl = document.getElementById("onlineCount");
const ratingText = document.getElementById("ratingText");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const opponentNameEl = document.getElementById("opponentName");

const normalBtn = document.getElementById("normalBtn");
const rankedBtn = document.getElementById("rankedBtn");
const finishBtn = document.getElementById("finishBtn");
const cancelBtn = document.getElementById("cancelBtn");

const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
let ws = new WebSocket(`${socketProtocol}//${location.host}`);

let pc = null;
let localStream = null;
let smoothedScore = 0;
let elo = Number(localStorage.getItem("elo") || 1000);
let playerName = localStorage.getItem("playerName") || "";

eloEl.textContent = elo;
nameInput.value = playerName;

function status(text) {
  statusEl.textContent = text;
}

function send(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function addChat(name, message, mine = false) {
  const div = document.createElement("div");
  div.className = `chat-message ${mine ? "mine" : ""}`;
  div.innerHTML = `<b>${name}</b><span>${message}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getRating(score) {
  if (score >= 9.5) return "🔥 Chudmaxxer";
  if (score >= 8) return "💎 Elite";
  if (score >= 6) return "⚡ Meltmaxxer";
  if (score >= 4) return "😎 Casual";
  if (score >= 2) return "🟡 Rookie";
  return "🌀 Beginner";
}

function renderLeaderboard(players) {
  leaderboardEl.innerHTML = "";

  if (!players || players.length === 0) {
    leaderboardEl.innerHTML = "<p>No players yet.</p>";
    return;
  }

  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leader-row";
    row.innerHTML = `
      <div>
        <span>#${i + 1} ${p.name}</span>
        <small>${p.rank || "Bronze"}</small>
      </div>
      <b>${p.elo}</b>
    `;
    leaderboardEl.appendChild(row);
  });
}

async function setupCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  localVideo.srcObject = localStream;
  await localVideo.play();
}

function createPeerConnection(isInitiator) {
  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" }
    ],
  });

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.play().catch(() => {});
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      send({ type: "ice", candidate: event.candidate });
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", offer });
    };
  }
}

async function handleOffer(offer) {
  if (!pc) createPeerConnection(false);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  send({ type: "answer", answer });
}

async function handleAnswer(answer) {
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIce(candidate) {
  if (!pc || !candidate) return;

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {}
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function getMeltScore(lm) {
  const jaw = distance(lm[152], lm[10]);
  const symmetry = 1 - Math.abs(lm[234].x - (1 - lm[454].x));
  const eyes = distance(lm[159], lm[145]) + distance(lm[386], lm[374]);
  const mouth = distance(lm[61], lm[291]);

  const raw = jaw * 120 + symmetry * 40 + eyes * 80 + mouth * 40;

  return Math.max(0, Math.min(10, raw));
}

ws.onopen = () => {
  status("Connected online.");
};

ws.onmessage = async event => {
  const data = JSON.parse(event.data);

  if (data.type === "online") {
    onlineCountEl.textContent = `${data.count} online`;
  }

  if (data.type === "waiting") {
    status(`Searching ${data.mode} match...`);
  }

  if (data.type === "match") {
    status(`${data.mode.toUpperCase()} match found!`);
    opponentNameEl.textContent = data.opponentName || "Opponent";
    createPeerConnection(data.initiator);
  }

  if (data.type === "offer") await handleOffer(data.offer);
  if (data.type === "answer") await handleAnswer(data.answer);
  if (data.type === "ice") await handleIce(data.candidate);

  if (data.type === "opponentScore") {
    oppScoreEl.textContent = Number(data.score).toFixed(1);
  }

  if (data.type === "leaderboard") {
    renderLeaderboard(data.leaderboard);
  }

  if (data.type === "chat") {
    addChat(data.name, data.message, data.name === playerName);
  }

  if (data.type === "result") {
    elo = data.elo;
    localStorage.setItem("elo", elo);
    eloEl.textContent = elo;

    if (data.draw) status("Draw!");
    else if (data.win) status("Victory! +25 ELO");
    else status("Defeat! -25 ELO");
  }

  if (data.type === "opponentLeft") {
    status("Opponent disconnected.");
    remoteVideo.srcObject = null;
    oppScoreEl.textContent = "0.0";
    opponentNameEl.textContent = "Opponent";
  }
};

function join(mode) {
  playerName = nameInput.value.trim() || "Player";
  localStorage.setItem("playerName", playerName);

  send({
    type: "join",
    mode,
    name: playerName,
    elo,
  });

  status(`Joining ${mode}...`);
}

normalBtn.onclick = () => join("normal");
rankedBtn.onclick = () => join("ranked");
finishBtn.onclick = () => send({ type: "finish" });
cancelBtn.onclick = () => send({ type: "cancelQueue" });

sendChatBtn.onclick = () => {
  const message = chatInput.value.trim();
  if (!message) return;

  send({
    type: "chat",
    message,
  });

  chatInput.value = "";
};

chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendChatBtn.click();
});

const faceMesh = new FaceMesh({
  locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

faceMesh.onResults(results => {
  canvas.width = localVideo.videoWidth || 640;
  canvas.height = localVideo.videoHeight || 480;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  const lm = results.multiFaceLandmarks[0];
  const score = getMeltScore(lm);

  smoothedScore = smoothedScore * 0.85 + score * 0.15;

  myScoreEl.textContent = smoothedScore.toFixed(1);
  ratingText.textContent = getRating(smoothedScore);

  send({
    type: "score",
    score: Number(smoothedScore.toFixed(1)),
    rating: getRating(smoothedScore),
  });

  lm.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#22d3ee";
    ctx.fill();
  });
});

async function startAI() {
  await setupCamera();

  const camera = new Camera(localVideo, {
    onFrame: async () => {
      await faceMesh.send({ image: localVideo });
    },
    width: 640,
    height: 480,
  });

  camera.start();
}

startAI().catch(err => {
  console.error(err);
  status("Allow camera and microphone permissions.");
});
