window.firebaseConfig = {
  apiKey: "AIzaSyDIIRn8RCfr_LY4FpSK6BK3YZLKJpIKBaQ",
  authDomain: "meltmaxxing-c3b51.firebaseapp.com",
  projectId: "meltmaxxing-c3b51",
  storageBucket: "meltmaxxing-c3b51.firebasestorage.app",
  messagingSenderId: "575296090962",
  appId: "1:575296090962:web:0c48cd6248656bb2b3c08b",
  measurementId: "G-LM707NCZW2"
};

(function () {
  let currentUser = null;

  function $(id) {
    return document.getElementById(id);
  }

  function avatarFor(name) {
    const saved = localStorage.getItem("pfpUrl");
    if (saved) return saved;
    return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name || "Player")}`;
  }

  function setLoggedIn(userLike) {
    currentUser = userLike;
    const name = userLike?.displayName || localStorage.getItem("playerName") || $("nameInput")?.value || "Player";
    const photo = localStorage.getItem("pfpUrl") || userLike?.photoURL || avatarFor(name);

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("playerName", name);
    if (photo) localStorage.setItem("pfpUrl", photo);

    if ($("accountName")) $("accountName").textContent = name;
    if ($("accountStatus")) $("accountStatus").textContent = "Ranked unlocked";
    if ($("profileAvatar")) $("profileAvatar").src = photo;
    if ($("settingsAvatar")) $("settingsAvatar").src = photo;
    if ($("nameInput")) $("nameInput").value = name;
    if ($("profileNameInput")) $("profileNameInput").value = name;
    if ($("pfpInput")) $("pfpInput").value = photo;
    if ($("loginBtn")) $("loginBtn").textContent = "Signed in";
    if ($("rankedBtn")) $("rankedBtn").classList.remove("locked");
  }

  function setLoggedOut() {
    currentUser = null;
    localStorage.removeItem("isLoggedIn");
    if ($("accountName")) $("accountName").textContent = "Guest";
    if ($("accountStatus")) $("accountStatus").textContent = "Ranked locked";
    if ($("profileAvatar")) $("profileAvatar").src = avatarFor("Player");
    if ($("settingsAvatar")) $("settingsAvatar").src = avatarFor("Player");
    if ($("loginBtn")) $("loginBtn").textContent = "Google";
    if ($("rankedBtn")) $("rankedBtn").classList.add("locked");
  }

  async function loginWithGoogle() {
    if (!window.firebase || !firebase.auth) {
      alert("Firebase auth did not load. Refresh the page and try again.");
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      console.error("Google login failed:", err);
      alert("Google login failed. Make sure Google provider is enabled and your Render domain is authorized in Firebase Authentication settings.");
    }
  }

  window.addEventListener("load", () => {
    if (window.firebase && firebase.initializeApp) {
      try {
        firebase.initializeApp(window.firebaseConfig);
        firebase.auth().onAuthStateChanged(user => {
          if (user) setLoggedIn(user);
          else setLoggedOut();
        });
      } catch (err) {
        console.warn("Firebase init failed", err);
        setLoggedOut();
      }
    } else {
      setLoggedOut();
    }

    const authOverlay = $("authOverlay");
    const rankedBtn = $("rankedBtn");
    const loginBtn = $("loginBtn");
    const googleLoginBtn = $("googleLoginBtn");
    const closeAuthBtn = $("closeAuthBtn");
    const settingsPanel = $("settingsPanel");

    if (rankedBtn) {
      const oldRanked = rankedBtn.onclick;
      rankedBtn.onclick = event => {
        if (localStorage.getItem("isLoggedIn") !== "true") {
          event.preventDefault();
          authOverlay?.classList.remove("hidden");
          return;
        }
        if (typeof oldRanked === "function") oldRanked.call(rankedBtn, event);
      };
    }

    if (loginBtn) loginBtn.onclick = loginWithGoogle;
    if (googleLoginBtn) googleLoginBtn.onclick = loginWithGoogle;
    if (closeAuthBtn) closeAuthBtn.onclick = () => authOverlay?.classList.add("hidden");

    if ($("settingsBtn")) $("settingsBtn").onclick = () => settingsPanel?.classList.remove("hidden");
    if ($("closeSettingsBtn")) $("closeSettingsBtn").onclick = () => settingsPanel?.classList.add("hidden");

    if ($("saveProfileBtn")) {
      $("saveProfileBtn").onclick = () => {
        const name = $("profileNameInput")?.value.trim() || localStorage.getItem("playerName") || "Player";
        const pfp = $("pfpInput")?.value.trim() || avatarFor(name);
        localStorage.setItem("playerName", name);
        localStorage.setItem("pfpUrl", pfp);
        setLoggedIn({ displayName: name, photoURL: pfp });
        settingsPanel?.classList.add("hidden");
      };
    }

    if ($("logoutBtn")) {
      $("logoutBtn").onclick = async () => {
        if (window.firebase?.auth) await firebase.auth().signOut().catch(() => {});
        setLoggedOut();
        settingsPanel?.classList.add("hidden");
      };
    }
  });
})();
