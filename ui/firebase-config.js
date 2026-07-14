// Firebase web app configuration for the setlister project.
//
// The apiKey below is a *public* client identifier, not a secret — it is safe
// to commit. Access control is governed entirely by Firestore security rules
// (firestore.rules), not by this key.
//
// These values are obtained from the Firebase console or by running:
//   firebase apps:sdkconfig web --project=songbook-generator
// See the "One-time setup" section in README.md for full instructions.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "songbook-generator.firebaseapp.com",
  projectId: "songbook-generator",
  storageBucket: "songbook-generator.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};
