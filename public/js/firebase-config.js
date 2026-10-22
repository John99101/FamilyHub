// Web app config of your Firebase project. Paste the values from
// Firebase console → Project settings → General → Your apps → SDK setup and configuration → Config.
// See SETUP.md, step 2.
//
// These values are NOT secret. They only tell the browser which Firebase
// project to talk to; every visitor can see them anyway. What protects the
// data is the sign in, the allow list in Firestore, the security rules in
// firestore.rules, and App Check.
export const firebaseConfig = {
  apiKey: 'HIER_EINFUEGEN',
  authDomain: 'familyhub-platzhalter.firebaseapp.com',
  projectId: 'familyhub-platzhalter',
  storageBucket: 'familyhub-platzhalter.firebasestorage.app',
  messagingSenderId: 'HIER_EINFUEGEN',
  appId: 'HIER_EINFUEGEN',
};

// App Check with reCAPTCHA Enterprise (SETUP.md, step 6).
// Leave empty until you have created the key; App Check then stays off.
export const recaptchaEnterpriseSiteKey = '';
