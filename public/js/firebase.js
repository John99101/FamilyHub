// Loads the Firebase SDK (one pinned version, from Google's CDN) and starts
// Auth, Firestore and App Check. Every other module imports Firebase from here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, collection, query, where, orderBy, limit,
  onSnapshot, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp,
  arrayUnion, arrayRemove, deleteField,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js';
import { firebaseConfig, recaptchaEnterpriseSiteKey } from './firebase-config.js';
import { lang } from './i18n.js';

// On this computer (npm run emulators) the app uses the local emulators and a
// demo project, so tests can never touch the real data.
export const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const config = isLocal
  ? { apiKey: 'demo-api-key', authDomain: 'demo-familyhub.firebaseapp.com', projectId: 'demo-familyhub', appId: 'demo-app' }
  : firebaseConfig;

export const app = initializeApp(config);

if (!isLocal && recaptchaEnterpriseSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
auth.languageCode = lang;

export const db = getFirestore(app);

if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  doc, collection, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, deleteField,
};
