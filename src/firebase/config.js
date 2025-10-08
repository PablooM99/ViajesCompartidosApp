import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ⚠️ Rellena con tu config real de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAn7zRJ1i5kKPLyZ1jemiy0Jvzr1-nygiE",
    authDomain: "viajes-compartidos-9ec7a.firebaseapp.com",
    projectId: "viajes-compartidos-9ec7a",
    storageBucket: "viajes-compartidos-9ec7a.firebasestorage.app",
    messagingSenderId: "900322524151",
    appId: "1:900322524151:web:ebc9aaabb2d42c3f2f8cf2",
    measurementId: "G-YEKTVM6003"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, googleProvider, db, storage };
