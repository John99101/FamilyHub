// Web app config of your Firebase project. Paste the values from
// Firebase console → Project settings → General → Your apps → SDK setup and configuration → Config.
// See SETUP.md, step 2.
//
// These values are NOT secret. They only tell the browser which Firebase
// project to talk to; every visitor can see them anyway. What protects the
// data is the sign in, the allow list in Firestore, the security rules in
// firestore.rules, and App Check.
export const firebaseConfig = {
  apiKey: 'AIzaSyBDeUfLi79yq6oTVvOVr9v3fdlyc0J4lp0',
  authDomain: 'familyhub-5355f.firebaseapp.com',
  projectId: 'familyhub-5355f',
  storageBucket: 'familyhub-5355f.firebasestorage.app',
  messagingSenderId: '264183809855',
  appId: '1:264183809855:web:e3c2a844c297b1a239358a',
  // measurementId (G-...) is left out on purpose: the app does not use Google Analytics.
};

// App Check with reCAPTCHA Enterprise (SETUP.md, step 6).
// Leave empty until you have created the key; App Check then stays off.
export const recaptchaEnterpriseSiteKey = '6LdbwvwtAAAAAIvVZprsl9fSkq_jrz61caOR0eDa';
