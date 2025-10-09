import { getFunctions } from "firebase/functions";
import { app } from "./config";

// Definí la región en .env.local -> VITE_FIREBASE_FUNCTIONS_REGION=southamerica-east1 (o us-central1)
export const FUNCTIONS_REGION =
  import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1";

export const functions = getFunctions(app, FUNCTIONS_REGION);
