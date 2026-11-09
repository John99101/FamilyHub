// Loads the Firebase SDK (one pinned version, from Google's CDN) and starts
// Auth, Firestore, Functions and App Check. Every other module imports Firebase from here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, updateProfile,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc as fsDoc, collection as fsCollection, collectionGroup, query, where,
  orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp,
  arrayUnion, arrayRemove, deleteField,
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js';
import { firebaseConfig, recaptchaEnterpriseSiteKey } from './firebase-config.js';
import { lang } from './i18n.js';
import { scopedPath } from './scope.js';

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
const functions = getFunctions(app, 'europe-west3');

if (isLocal) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// doc(db, 'rooms', id) and collection(db, `${base}events`) work as before:
// paths from db go into the active group (see scope.js).
export function doc(parent, ...segments) {
  return parent === db && segments.length ? fsDoc(db, scopedPath(segments.join('/'))) : fsDoc(parent, ...segments);
}

export function collection(parent, ...segments) {
  return parent === db ? fsCollection(db, scopedPath(segments.join('/'))) : fsCollection(parent, ...segments);
}

/** Calls one of the group functions (createGroupCall, joinGroupCall, setGroupPasswordCall). */
export async function callFunction(name, data) {
  return (await httpsCallable(functions, name)(data)).data;
}

export {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile,
  collectionGroup, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, deleteField,
};
