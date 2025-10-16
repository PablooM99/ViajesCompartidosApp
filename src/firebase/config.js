import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { setLogLevel as setFirestoreLogLevel } from "firebase/firestore";
import { setLogLevel as setFirebaseLogLevel } from "firebase/app";

setFirestoreLogLevel("error");
setFirebaseLogLevel?.("error");

const firebaseConfig = {
  apiKey: "AIzaSyAn7zRJ1i5kKPLyZ1jemiy0Jvzr1-nygiE",
  authDomain: "viajes-compartidos-9ec7a.firebaseapp.com",
  projectId: "viajes-compartidos-9ec7a",
  storageBucket: "viajes-compartidos-9ec7a.firebasestorage.app",
  messagingSenderId: "900322524151",
  appId: "1:900322524151:web:ebc9aaabb2d42c3f2f8cf2",
  measurementId: "G-YEKTVM6003"
};

export const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);
auth.useDeviceLanguage();

export const googleProvider = new GoogleAuthProvider();
// Muestra selector de cuenta siempre (evita reusar sesión vieja)
googleProvider.setCustomParameters({ prompt: "select_account" });

// DB / Storage / Functions
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1"); // o tu región si usas Functions
