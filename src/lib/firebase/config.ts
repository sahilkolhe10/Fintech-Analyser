// Firebase Configuration for FinManage
// Lazy initialization — Firebase is only touched when a real (non-demo)
// session needs it. This avoids the Firebase Auth iframe + network calls
// (and errors like auth/configuration-not-found) on every page load when
// the project config is missing/invalid.
import { initializeApp, getApps, FirebaseApp, deleteApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { isDemoSession } from '@/services/demo';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

const hasValidConfig = (): boolean => {
    return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
};

const ensureApp = (): FirebaseApp | null => {
    if (app) return app;
    if (!hasValidConfig()) return null;
    // Skip Firebase entirely during a demo session (no iframe, no network).
    if (isDemoSession()) return null;
    try {
        app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
        return app;
    } catch {
        return null;
    }
};

// Lazy getters — safe to call anywhere; return null when not configured or
// when a demo session is active.
export const getFirebaseAuth = (): Auth | null => {
    if (auth) return auth;
    const a = ensureApp();
    if (!a) return null;
    try {
        auth = getAuth(a);
        return auth;
    } catch {
        return null;
    }
};

export const getFirebaseDb = (): Firestore | null => {
    if (db) return db;
    const a = ensureApp();
    if (!a) return null;
    try {
        db = getFirestore(a);
        return db;
    } catch {
        return null;
    }
};

export const getFirebaseStorage = (): FirebaseStorage | null => {
    if (storage) return storage;
    const a = ensureApp();
    if (!a) return null;
    try {
        storage = getStorage(a);
        return storage;
    } catch {
        return null;
    }
};

// Legacy named exports — kept for compatibility; they now go through the
// same lazy path. NOTE: importing these no longer triggers Firebase init.
export { };
export const isFirebaseConfigured = (): boolean => {
    return hasValidConfig() && !isDemoSession();
};

// Test-only helper.
export const _resetFirebaseForTest = (): void => {
    if (app) {
        try { deleteApp(app); } catch { /* noop */ }
    }
    app = null;
    auth = null;
    db = null;
    storage = null;
};
