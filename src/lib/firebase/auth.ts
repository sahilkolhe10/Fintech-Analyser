// Firebase Authentication Service for FinManage
// Handles all authentication methods: Email, Google, Phone

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signInWithPhoneNumber,
    GoogleAuthProvider,
    RecaptchaVerifier,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile,
    User,
    UserCredential,
    ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuth } from './config';

// Types for authentication
export interface AuthResult {
    success: boolean;
    user?: User;
    error?: string;
}

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

// Sign up with Email and Password
export const signUpWithEmail = async (
    email: string,
    password: string,
    displayName?: string
): Promise<AuthResult> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth) {
            return { success: false, error: 'Firebase not configured' };
        }

        const result: UserCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        // Update display name if provided
        if (displayName && result.user) {
            await updateProfile(result.user, { displayName });
        }

        return { success: true, user: result.user };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
        return { success: false, error: errorMessage };
    }
};

// Sign in with Email and Password
export const signInWithEmail = async (
    email: string,
    password: string
): Promise<AuthResult> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth) {
            return { success: false, error: 'Firebase not configured' };
        }

        const result: UserCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
        );

        return { success: true, user: result.user };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
        return { success: false, error: errorMessage };
    }
};

// Sign in with Google
export const signInWithGoogle = async (): Promise<AuthResult> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth) {
            return { success: false, error: 'Firebase not configured' };
        }

        const result: UserCredential = await signInWithPopup(auth, googleProvider);
        return { success: true, user: result.user };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Google sign in failed';
        return { success: false, error: errorMessage };
    }
};

// Phone Authentication - Setup Recaptcha
let recaptchaVerifier: RecaptchaVerifier | null = null;

export const setupRecaptcha = (containerId: string): RecaptchaVerifier | null => {
    const auth = getFirebaseAuth();
    if (!auth) {
        console.error('Firebase not configured');
        return null;
    }

    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size: 'invisible',
        callback: () => {
            // reCAPTCHA solved, allow sending OTP
        },
    });

    return recaptchaVerifier;
};

// Phone Authentication - Send OTP
export const sendPhoneOTP = async (
    phoneNumber: string
): Promise<{ success: boolean; confirmationResult?: ConfirmationResult; error?: string }> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth || !recaptchaVerifier) {
            return { success: false, error: 'Phone auth not set up. Call setupRecaptcha first.' };
        }

        const confirmationResult = await signInWithPhoneNumber(
            auth,
            phoneNumber,
            recaptchaVerifier
        );

        return { success: true, confirmationResult };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send OTP';
        return { success: false, error: errorMessage };
    }
};

// Phone Authentication - Verify OTP
export const verifyPhoneOTP = async (
    confirmationResult: ConfirmationResult,
    otp: string
): Promise<AuthResult> => {
    try {
        const result: UserCredential = await confirmationResult.confirm(otp);
        return { success: true, user: result.user };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid OTP';
        return { success: false, error: errorMessage };
    }
};

// Sign Out
export const logOut = async (): Promise<{ success: boolean; error?: string }> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth) {
            return { success: false, error: 'Firebase not configured' };
        }

        await signOut(auth);
        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
        return { success: false, error: errorMessage };
    }
};

// Reset Password
export const resetPassword = async (
    email: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const auth = getFirebaseAuth();
        if (!auth) {
            return { success: false, error: 'Firebase not configured' };
        }

        await sendPasswordResetEmail(auth, email);
        return { success: true };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Password reset failed';
        return { success: false, error: errorMessage };
    }
};

// Auth State Observer
export const subscribeToAuthChanges = (
    callback: (user: User | null) => void
): (() => void) => {
    const auth = getFirebaseAuth();
    if (!auth) {
        console.warn('Firebase not configured');
        return () => { };
    }

    return onAuthStateChanged(auth, callback);
};

// Get Current User
export const getCurrentUser = (): User | null => {
    const auth = getFirebaseAuth();
    return auth?.currentUser ?? null;
};
