/* =====================================================================
   Read With Me — Firebase configuration (EXAMPLE / TEMPLATE)

   HOW TO USE:
   1. Copy this file's contents into firebase-config.js (same folder),
      replacing every "YOUR_..." value with the web config from your
      Firebase project: Firebase console > Project settings > General >
      "Your apps" > Web app > SDK setup and configuration > Config.
   2. In the Firebase console, open AI Logic (Build > AI Logic) and click
      "Get started", choosing the Gemini Developer API (free Spark plan
      is fine). That enables the APIs the cloud layer calls.
   3. Serve the app over http(s) and open it — the Grown-ups panel will
      report "Cloud is ON".

   WHAT THE CONFIG MUST CONTAIN (a standard Firebase web config object):
     apiKey            — your project's web API key
     authDomain        — "<project-id>.firebaseapp.com"
     projectId         — your Firebase project ID
     storageBucket     — "<project-id>.appspot.com" (not used by the app,
                         part of the standard object; safe to include)
     messagingSenderId — numeric sender ID (not used by the app)
     appId             — "1:<sender>:web:<hash>" for the registered web app

   OPTIONAL:
     cloudModel        — the cloud Gemini model Firebase AI Logic should
                         use when hybrid inference falls back to the cloud.
                         This project uses "gemini-3.8-flash".
     fallbackModel     — a lightweight model retried once if the main
                         cloud model errors. This project uses
                         "gemini-3.5-flash-lite".

   NOTES:
   - A Firebase web config is NOT a secret API key vault — it identifies
     the project. Protect usage with Firebase App Check + quota alerts
     in the console (the AI Logic guided setup enforces App Check; for
     local development you may need to register an App Check debug token,
     see README.md).
   - Never commit a filled-in firebase-config.js to a public repo if you
     prefer to keep your project ID private; the app runs fully on-device
     without it.
   ===================================================================== */
window.RWM_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
  // , cloudModel: "gemini-3.8-flash"
  // , fallbackModel: "gemini-3.5-flash-lite"
};
