const SCREEN = {
  menu: document.getElementById("menuScreen"),
  match: document.getElementById("matchScreen")
};

function showMenuScreen() {
  SCREEN.menu?.classList.remove("hidden");
  SCREEN.match?.classList.add("hidden");
}

function showMatchScreen() {
  SCREEN.menu?.classList.add("hidden");
  SCREEN.match?.classList.remove("hidden");
}

const oldScreenShowQueue = showQueue;
showQueue = function(title, sub) {
  showMenuScreen();
  oldScreenShowQueue(title, sub);
};

const oldScreenHideQueue = hideQueue;
hideQueue = function() {
  oldScreenHideQueue();
};

const oldScreenOnMessage = ws.onmessage;
ws.onmessage = async function(event) {
  const data = JSON.parse(event.data);
  if (data.type === "match") showMatchScreen();
  await oldScreenOnMessage(event);
  if (data.type === "result" || data.type === "opponentLeft") {
    setTimeout(showMenuScreen, 1200);
  }
};

window.addEventListener("load", () => {
  showMenuScreen();
});
