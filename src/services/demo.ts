// Local demo mode — lets you explore the app without Firebase credentials.
// Activated from the login page ("Explore demo") or when DEMO_MODE=1 is set.
import type { AppUser } from '@/store';
import type { User } from 'firebase/auth';

export interface DemoUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    isDemo: true;
}

export const DEMO_USER: DemoUser = {
    uid: 'demo-user',
    email: 'demo@khatahouse.app',
    displayName: 'Demo Investor',
    photoURL: undefined,
    isDemo: true,
};

export const DEMO_PASSWORD = 'demo1234';

// True when a persisted demo session is active in the store.
export const isDemoSession = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const raw = window.localStorage.getItem('khatahouse-auth');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const user = parsed?.state?.user;
        return Boolean(user && user.isDemo);
    } catch {
        return false;
    }
};

// Type guard — is this a local demo user (not a Firebase User)?
export const isDemoUser = (user: AppUser | null | undefined): user is DemoUser => {
    return Boolean(user && 'isDemo' in user && (user as DemoUser).isDemo === true);
};

// Get a bearer token for server calls — real Firebase users get an ID token,
// demo users get a stable placeholder (server endpoints skip auth for demo).
export const getAppUserToken = async (user: AppUser | null): Promise<string | undefined> => {
    if (!user) return undefined;
    if (isDemoUser(user)) return 'demo-token';
    return (user as User).getIdToken();
};
