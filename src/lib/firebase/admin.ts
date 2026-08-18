// Firebase Admin SDK — server-side access (API routes, Telegram bot)
// Uses FIREBASE_SERVICE_ACCOUNT (JSON string) or ADC/GOOGLE_APPLICATION_CREDENTIALS.

import { initializeApp, cert, getApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage, type Storage } from 'firebase-admin/storage';

let app: App | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: Storage | null = null;
let initError: string | null = null;

export function getAdminApp(): App | null {
    if (initError) return null;
    if (app) return app;
    if (typeof window !== 'undefined') {
        initError = 'Firebase Admin is server-only';
        return null;
    }

    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
        initError = 'Firebase project ID not configured';
        return null;
    }

    try {
        if (getApps().length) {
            app = getApp();
        } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            app = initializeApp({
                projectId,
                credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
            });
        } else {
            // Fall back to Application Default Credentials (works on GCP + local ADC)
            app = initializeApp({ projectId });
        }
        return app;
    } catch (error: unknown) {
        initError = error instanceof Error ? error.message : 'Failed to init Firebase Admin';
        console.error('Firebase Admin init error:', initError);
        return null;
    }
}

export function getAdminDb(): Firestore | null {
    const adminApp = getAdminApp();
    if (!adminApp || db) return db;
    db = getFirestore(adminApp);
    return db;
}

export function getAdminAuth(): Auth | null {
    const adminApp = getAdminApp();
    if (!adminApp || auth) return auth;
    auth = getAuth(adminApp);
    return auth;
}

export function getAdminStorage(): Storage | null {
    const adminApp = getAdminApp();
    if (!adminApp || storage) return storage;
    storage = getStorage(adminApp);
    return storage;
}

export function getAdminError(): string | null {
    return initError;
}

export function isAdminConfigured(): boolean {
    return getAdminApp() !== null;
}