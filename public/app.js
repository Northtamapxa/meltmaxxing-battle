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
const oppRatingText = document.getElementById("oppRatingText");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const opponentNameEl = document.getElementById("opponentName");
const connectionPill = document.getElementById("connectionPill");
const queueOverlay = document.getElementById("queueOverlay");
const queueTitle = document.getElementById("queueTitle");
const queueSub = document.getElementById("queueSub");
const timerText = document.getElementById("timerText");
const timerFill = document.getElementById("timerFill");
const resultText = document.getElementById("resultText");
const rankText = document.getElementById("rankText");
const levelText = document.getElementById("levelText");
const xpText = document.getElementById("xpText");
const recordText = document.getElementById("recordText");
const streakText = document.getElementById("streakText");
const roomCodeInput = document.getElementById("roomCodeInput");
const inviteCode = document.getElementById("inviteCode");
const clipDownload = document.getElementById("clipDownload");

const normalBtn = document.getElementById("normalBtn");
const rankedBtn = document.getElementById("rankedBtn");
const privateBtn = document.getElementById("privateBtn");
const joinPrivateBtn = document.getElementById("joinPrivateBtn");
const spectateBtn = document.getElementById("spectateBtn");
const partyBtn = document.getElementById("partyBtn");
const cancelBtn = document.getElementById("cancelBtn");
const recordBtn = document.getElementById("recordBtn");
const musicBtn = document.getElementById("musicBtn");
const muteBtn = document.getElementById("muteBtn");

const ICON_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/";
function icon(code, label = "") {
  return `<img class="net-icon" src="${ICON_BASE}${code}.svg" alt="${label}" loading="lazy">`;
}
function iconText(code, text, label = text) {
  return `${icon(code, label)} <span>${text}</span>`;
}

const socketProtocol = location.protocol === "https:" ? "wss:" : "ws:";
let ws = new WebSocket(`${socketProtocol}//${location.host}`);

let pc = null;
let localStream = null;
let smoothedScore = 0;
let elo = Number(localStorage.getItem("elo") || 500);
let playerName = localStorage.getItem("playerName") || "";
let matchEndAt = 0;
let timerLoop = null;
let mutedVoice = false;
let recorder = null;
let recordedChunks = [];
let musicOn = false;
let audioCtx = null;
let musicOsc = null;
let meltBaseline = null;
let previousNose = null;
let baselineFrames = 0;

if (eloEl) eloEl.textContent = elo;
if (nameInput) nameInput.value = playerName;

function status(text) {
  if (statusEl) statusEl.textContent = text;
  console.log("[status]", text);
}

function setConnection(text) {
  if (connectionPill) connectionPill.textContent = text;
}

function send(data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function showQueue(title, sub) {
  if (!queueOverlay) return;
  queueOverlay.classList.remove("hidden");
  if (queueTitle) queueTitle.textContent = title;
  if (queueSub) queueSub.textContent = sub;
}

function hideQueue() {
  if (queueOverlay) queueOverlay.classList.add("hidden");
}

function rankIcon(rank) {
  const name = String(rank || "Bronze").toLowerCase();
  if (name.includes("omega")) return iconText("1f6e1", "Omega Knight", "shield");
  if (name.includes("mythic")) return iconText("1f409", "Mythic Mogger", "dragon");
  if (name.includes("final")) return iconText("1f451", "Final Boss", "crown");
  if (name.includes("aura")) return iconText("1f48e", "Aura Emperor", "diamond");
  if (name.includes("rizz baron")) return iconText("1f525", "Rizz Baron", "fire");
  if (name.includes("looksmax")) return iconText("26a1", "Looksmax Lord", "lightning");
  if (name.includes("mog intern")) return iconText("1f9ea", "Mog Intern", "test tube");
  if (name.includes("rizzlet")) return iconText("1f949", "Rizzlet", "medal");
  if (name.includes("npc")) return iconText("1f9cd", "NPC Spawn", "person");
  if (name.includes("sub")) return iconText("1f400", "Sub Maxxer", "rat");
  if (name.includes("legend")) return iconText("1f451", "Legend", "crown");
  if (name.includes("diamond")) return iconText("1f48e", "Diamond", "diamond");
  if (name.includes("platinum")) return iconText("1f6e1", "Platinum", "shield");
  if (name.includes("gold")) return iconText("1f3c6", "Gold", "trophy");
  if (name.includes("silver")) return iconText("1f948", "Silver", "silver medal");
  return iconText("1f949", "Bronze", "bronze medal");
}

function updateProfile(profile) {
  if (!profile) return;
  elo = Number(profile.elo || elo);
  localStorage.setItem("elo", elo);
  if (eloEl) eloEl.textContent = elo;
  if (rankText) rankText.innerHTML = rankIcon(profile.rank || getRankFromElo(elo));
  if (levelText) levelText.innerHTML = `${icon("2b50", "level")} ${profile.level || 1}`;
  if (xpText) xpText.innerHTML = `${icon("2728", "xp")} ${profile.xp || 0}`;
  if (recordText) recordText.innerHTML = `${icon("2705", "wins")} ${profile.wins || 0} ${icon("274c", "losses")} ${profile.losses || 0} ${icon("2796", "draws")} ${profile.draws || 0}`;
  if (streakText) streakText.innerHTML = `${icon("1f525", "streak")} ${profile.streak || 0}`;
}

function getRankFromElo(value) {
  if (value >= 10000) return "Omega Knight";
  if (value >= 8000) return "Mythic Mogger";
  if (value >= 6500) return "Final Boss";
  if (value >= 5000) return "Aura Emperor";
  if (value >= 3500) return "Rizz Baron";
  if (value >= 2500) return "Looksmax Lord";
  if (value >= 1500) return "Mog Intern";
  if (value >= 900) return "Rizzlet";
  if (value >= 500) return "NPC Spawn";
  return "Sub Maxxer";
}

function addChat(name, message, mine = false) {
  if (!chatMessages) return;
  const div = document.createElement("div");
  div.className = `chat-message ${mine ? "mine" : ""}`;
  div.innerHTML = `<b>${name}</b><span>${message}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getRating(score) {
  if (score >= 9.5) return iconText("1f9a0", "10/10", "melting face");
  if (score >= 8) return iconText("1f525", "9/10", "fire");
  if (score >= 6) return iconText("1f422", "7/10", "turtle");
  if (score >= 4) return iconText("1f62c", "5/10", "grimace");
  if (score >= 2) return iconText("1f642", "3/10", "smile");
  return iconText("1f9cd", "1/10", "person");
}

function renderLeaderboard(players) {
  if (!leaderboardEl) return;
  leaderboardEl.innerHTML = "";
  if (!players || players.length === 0) {
    leaderboardEl.innerHTML = "<p>No players yet.</p>";
    return;
  }
  players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "leader-row";
    row.innerHTML = `<div><span>#${i + 1} ${p.name}</span><small>${rankIcon(p.rank || "Bronze")} • ${icon("2b50", "level")} Lv ${p.level || 1}</small></div><b>${p.elo}</b>`;
    leaderboardEl.appendChild(row);
  });
}

async function setupCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera unsupported");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: true });
  } catch (err) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  }
  localVideo.srcObject = localStream;
  localVideo.muted = true;
  localVideo.playsInline = true;
  await localVideo.play().catch(() => {});
}

function cleanupPeerConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
}

function createPeerConnection(isInitiator) {
  cleanupPeerConnection();
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.playsInline = true;
    remoteVideo.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") status("Opponent video connected.");
    if (pc.connectionState === "failed") status("Video connection failed. Refresh both devices.");
  };
  pc.onicecandidate = event => {
    if (event.candidate) send({ type: "ice", candidate: event.candidate });
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
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIce(candidate) {
  if (!pc || !candidate) return;
  try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
}

function distance(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function getMeltScore(lm) {
  const faceWidth = Math.max(0.001, distance(lm[234], lm[454]));
  const faceHeight = Math.max(0.001, distance(lm[10], lm[152]));
  const nose = lm[1];
  const chin = lm[152];
  const forehead = lm[10];
  const mouthOpen = distance(lm[13], lm[14]) / faceWidth;
  const mouthWidth = distance(lm[61], lm[291]) / faceWidth;
  const eyeOpen = (distance(lm[159], lm[145]) + distance(lm[386], lm[374])) / faceWidth;
  const chinTuck = clamp((chin.y - nose.y) / faceHeight, 0, 1.4);
  const faceSquish = clamp(faceWidth / faceHeight, 0.55, 1.4);
  const lowerFaceSquish = clamp((chin.y - lm[17].y) / faceHeight, 0, 0.45);
  const headLow = clamp((nose.y - forehead.y) / faceHeight, 0, 1.1);
  const center = Math.abs(nose.x - 0.5);
  if (!meltBaseline) meltBaseline = { chinTuck, faceSquish, mouthOpen, mouthWidth, eyeOpen, headLow };
  baselineFrames++;
  const learningRate = baselineFrames < 35 ? 0.05 : 0.006;
  meltBaseline.chinTuck = meltBaseline.chinTuck * (1 - learningRate) + chinTuck * learningRate;
  meltBaseline.faceSquish = meltBaseline.faceSquish * (1 - learningRate) + faceSquish * learningRate;
  meltBaseline.mouthOpen = meltBaseline.mouthOpen * (1 - learningRate) + mouthOpen * learningRate;
  meltBaseline.mouthWidth = meltBaseline.mouthWidth * (1 - learningRate) + mouthWidth * learningRate;
  meltBaseline.eyeOpen = meltBaseline.eyeOpen * (1 - learningRate) + eyeOpen * learningRate;
  meltBaseline.headLow = meltBaseline.headLow * (1 - learningRate) + headLow * learningRate;
  const tuckScore = clamp((chinTuck - meltBaseline.chinTuck) * 18, 0, 3.4);
  const squishScore = clamp((faceSquish - meltBaseline.faceSquish) * 7, 0, 2.4);
  const lowerSquishScore = clamp(lowerFaceSquish * 7, 0, 1.5);
  const headDropScore = clamp((headLow - meltBaseline.headLow) * 10, 0, 1.3);
  const expressionScore = clamp((mouthOpen - meltBaseline.mouthOpen) * 8, 0, 0.9) + clamp((mouthWidth - meltBaseline.mouthWidth) * 3, 0, 0.7) + clamp((eyeOpen - meltBaseline.eyeOpen) * 4, 0, 0.6);
  const cameraControl = clamp(1 - center * 2.8, 0, 1) * 0.7;
  let motionEnergy = 0;
  if (previousNose) motionEnergy = clamp(distance(nose, previousNose) * 35, 0, 0.8);
  previousNose = { x: nose.x, y: nose.y };
  const raw = 0.8 + tuckScore + squishScore + lowerSquishScore + headDropScore + expressionScore + cameraControl + motionEnergy;
  return clamp(raw, 0, 10);
}

function startTimer(durationMs, startedAt) {
  matchEndAt = Number(startedAt || Date.now()) + Number(durationMs || 15000);
  if (timerLoop) clearInterval(timerLoop);
  timerLoop = setInterval(() => {
    const left = Math.max(0, matchEndAt - Date.now());
    if (timerText) timerText.textContent = (left / 1000).toFixed(1);
    if (timerFill) timerFill.style.width = `${Math.max(0, Math.min(100, (left / (durationMs || 15000)) * 100))}%`;
    if (left <= 0) clearInterval(timerLoop);
  }, 100);
}

function loadProfile() {
  playerName = nameInput.value.trim() || localStorage.getItem("playerName") || "Player";
  localStorage.setItem("playerName", playerName);
  send({ type: "loadProfile", name: playerName, elo });
}

ws.onopen = () => { setConnection("Online"); status("Connected online."); loadProfile(); };
ws.onerror = () => status("Connection error. Refresh.");
ws.onclose = () => { setConnection("Disconnected"); status("Disconnected. Refresh."); };

ws.onmessage = async event => {
  const data = JSON.parse(event.data);
  if (data.type === "online" && onlineCountEl) onlineCountEl.textContent = `${data.count} online`;
  if (data.type === "leaderboard") renderLeaderboard(data.leaderboard);
  if (data.type === "profile") updateProfile(data.profile);
  if (data.type === "waiting") { showQueue("Searching...", `${data.mode} matchmaking`); status(`Searching ${data.mode} match...`); }
  if (data.type === "cancelled") { hideQueue(); status("Queue cancelled."); }
  if (data.type === "privateCreated") { hideQueue(); if (inviteCode) inviteCode.textContent = `Invite code: ${data.code}`; if (roomCodeInput) roomCodeInput.value = data.code; showQueue("Private room ready", `Code: ${data.code}`); }
  if (data.type === "errorMessage") { hideQueue(); status(data.message); }
  if (data.type === "spectating") { hideQueue(); status(`Spectating ${data.a} vs ${data.b}`); if (opponentNameEl) opponentNameEl.textContent = `${data.a} vs ${data.b}`; startTimer(data.durationMs, data.startedAt); }
  if (data.type === "spectateScore") { myScoreEl.textContent = Number(data.aScore).toFixed(1); oppScoreEl.textContent = Number(data.bScore).toFixed(1); }
  if (data.type === "spectateResult") { status(`Final: ${data.a} ${data.aScore.toFixed(1)} - ${data.bScore.toFixed(1)} ${data.b}`); }
  if (data.type === "match") { hideQueue(); smoothedScore = 0; meltBaseline = null; previousNose = null; baselineFrames = 0; if (resultText) resultText.textContent = "Playing"; status(`${data.mode.toUpperCase()} match found!`); if (opponentNameEl) opponentNameEl.textContent = data.opponentName || "Opponent"; createPeerConnection(data.initiator); startTimer(data.durationMs, data.startedAt); }
  if (data.type === "offer") await handleOffer(data.offer);
  if (data.type === "answer") await handleAnswer(data.answer);
  if (data.type === "ice") await handleIce(data.candidate);
  if (data.type === "opponentScore") { oppScoreEl.innerHTML = `${Number(data.score).toFixed(1)} ${icon("1f9a0", "melt")}`; if (oppRatingText) oppRatingText.innerHTML = data.rating || "—"; }
  if (data.type === "chat") addChat(data.name, data.message, data.name === playerName);
  if (data.type === "result") { hideQueue(); updateProfile(data.profile); if (data.draw) { status("Draw!"); if (resultText) resultText.innerHTML = `${icon("2796", "draw")} Draw`; } else if (data.win) { status("Victory!"); if (resultText) resultText.innerHTML = `${icon("1f3c6", "win")} Win`; playBeep(660); } else { status("Defeat."); if (resultText) resultText.innerHTML = `${icon("1f480", "loss")} Loss`; playBeep(220); } }
  if (data.type === "opponentLeft") { hideQueue(); status("Opponent disconnected."); cleanupPeerConnection(); remoteVideo.srcObject = null; oppScoreEl.textContent = "0.0"; }
};

function join(mode) { playerName = nameInput.value.trim() || "Player"; localStorage.setItem("playerName", playerName); send({ type: "join", mode, name: playerName, elo }); showQueue("Searching...", `${mode} 1v1`); }
normalBtn.onclick = () => join("normal");
rankedBtn.onclick = () => join("ranked");
if (privateBtn) privateBtn.onclick = () => { playerName = nameInput.value.trim() || "Player"; send({ type: "createPrivate", mode: "normal", name: playerName, elo }); showQueue("Creating private room...", "Generating invite code"); };
if (joinPrivateBtn) joinPrivateBtn.onclick = () => send({ type: "joinPrivate", code: roomCodeInput.value, name: nameInput.value.trim() || "Player", elo });
if (spectateBtn) spectateBtn.onclick = () => send({ type: "spectate", code: roomCodeInput.value });
if (partyBtn) partyBtn.onclick = () => { status("Party queue uses private room codes for now."); if (privateBtn) privateBtn.click(); };
if (cancelBtn) cancelBtn.onclick = () => { send({ type: "cancelQueue" }); hideQueue(); };

if (sendChatBtn && chatInput) { sendChatBtn.onclick = () => { const message = chatInput.value.trim(); if (!message) return; send({ type: "chat", message }); chatInput.value = ""; }; chatInput.addEventListener("keydown", e => { if (e.key === "Enter") sendChatBtn.click(); }); }
if (muteBtn) muteBtn.onclick = () => { mutedVoice = !mutedVoice; if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = !mutedVoice); muteBtn.textContent = mutedVoice ? "Voice: Off" : "Voice: On"; };
function playBeep(freq = 440) { try { const ctxA = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctxA.createOscillator(); const gain = ctxA.createGain(); osc.frequency.value = freq; gain.gain.value = 0.04; osc.connect(gain); gain.connect(ctxA.destination); osc.start(); osc.stop(ctxA.currentTime + 0.16); } catch {} }
if (musicBtn) musicBtn.onclick = () => { try { musicOn = !musicOn; if (musicOn) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); musicOsc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); musicOsc.type = "sine"; musicOsc.frequency.value = 110; gain.gain.value = 0.015; musicOsc.connect(gain); gain.connect(audioCtx.destination); musicOsc.start(); musicBtn.textContent = "Music: On"; } else { if (musicOsc) musicOsc.stop(); musicBtn.textContent = "Music: Off"; } } catch {} };
if (recordBtn) recordBtn.onclick = () => { if (!localStream) return; if (recorder && recorder.state === "recording") { recorder.stop(); recordBtn.textContent = "Record Clip"; return; } recordedChunks = []; recorder = new MediaRecorder(localStream); recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); }; recorder.onstop = () => { const blob = new Blob(recordedChunks, { type: "video/webm" }); if (clipDownload) { clipDownload.href = URL.createObjectURL(blob); clipDownload.classList.remove("hidden"); } }; recorder.start(); recordBtn.textContent = "Stop Recording"; setTimeout(() => { if (recorder && recorder.state === "recording") recorder.stop(); recordBtn.textContent = "Record Clip"; }, 15000); };

const faceMesh = new FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
faceMesh.onResults(results => {
  canvas.width = localVideo.videoWidth || 640;
  canvas.height = localVideo.videoHeight || 480;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;
  const lm = results.multiFaceLandmarks[0];
  const score = getMeltScore(lm);
  smoothedScore = smoothedScore * 0.9 + score * 0.1;
  myScoreEl.innerHTML = `${smoothedScore.toFixed(1)} ${icon("1f9a0", "melt")}`;
  const rating = getRating(smoothedScore);
  if (ratingText) ratingText.innerHTML = rating;
  send({ type: "score", score: Number(smoothedScore.toFixed(1)), rating });
  lm.forEach(p => { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 1.3, 0, Math.PI * 2); ctx.fillStyle = "#60a5fa"; ctx.fill(); });
});

async function startAI() { await setupCamera(); const camera = new Camera(localVideo, { onFrame: async () => { await faceMesh.send({ image: localVideo }); }, width: 640, height: 480 }); camera.start(); status("Camera ready. Tuck your chin to meltmaxx."); }
startAI().catch(err => { console.error(err); status("Camera blocked. Allow camera/mic and refresh."); });
