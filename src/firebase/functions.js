// src/firebase/functions.js
import { getFunctions } from "firebase/functions";
import { app } from "./config";
export const FUNCTIONS_REGION = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";
export const functions = getFunctions(app, FUNCTIONS_REGION);
