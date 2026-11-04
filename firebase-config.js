import {initializeApp} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {initializeFirestore} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// الصق هون إعدادات مشروعك من Firebase Console > Project settings > Your apps > Web app
const firebaseConfig = {
  apiKey: "AIzaSyDNxR9CclKF_XyO1E-UyPb1C1BreYzsgbk",
  authDomain: "etc-competition.firebaseapp.com",
  projectId: "etc-competition",
  storageBucket: "etc-competition.firebasestorage.app",
  messagingSenderId: "251827872601",
  appId: "1:251827872601:web:869ec441f3bf0cee6ce248",
  measurementId: "G-JKJ2JRGSG6",
};

export const app = initializeApp(firebaseConfig);
// long polling تلقائي: بيشتغل حتى لو شبكة الجامعة بتحجب WebSocket
export const db = initializeFirestore(app, {experimentalAutoDetectLongPolling: true});
