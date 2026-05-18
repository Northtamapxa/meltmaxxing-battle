// Firebase Web App config goes here.
// To make real Google login work, replace these empty values with your Firebase Web App config.
// Firebase Console > Project Settings > Your apps > Web app config.
window.firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: ""
};

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDIIRn8RCfr_LY4FpSK6BK3YZLKJpIKBaQ",
  authDomain: "meltmaxxing-c3b51.firebaseapp.com",
  projectId: "meltmaxxing-c3b51",
  storageBucket: "meltmaxxing-c3b51.firebasestorage.app",
  messagingSenderId: "575296090962",
  appId: "1:575296090962:web:0c48cd6248656bb2b3c08b",
  measurementId: "G-LM707NCZW2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
