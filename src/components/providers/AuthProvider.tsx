'use client';

// Auth Provider Component
import { useEffect, ReactNode } from 'react';
import { useAuthStore } from '@/store';
import { subscribeToAuthChanges } from '@/lib/firebase/auth';
import { getUserProfile, createUserProfile, Timestamp } from '@/lib/firebase/firestore';

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const { setUser, setProfile, setLoading } = useAuthStore();

    useEffect(() => {
        // If a demo session is already active (e.g. page refresh), keep it —
        // don't let a failing Firebase subscription wipe it.
        const current = useAuthStore.getState().user;
        if (current && 'isDemo' in current && current.isDemo) {
            setLoading(false);
            return;
        }

        let unsubscribe: (() => void) | undefined;
        try {
            unsubscribe = subscribeToAuthChanges(async (user) => {
                setUser(user);

                if (user) {
                    // Real Firebase session supersedes any persisted demo session.
                    try {
                        // Try to get existing profile
                        const result = await getUserProfile(user.uid);

                        if (result.success && result.data) {
                            setProfile(result.data);
                        } else {
                            // Create new profile for new users
                            try {
                                await createUserProfile(user.uid, {
                                    uid: user.uid,
                                    email: user.email || '',
                                    displayName: user.displayName || '',
                                    photoURL: user.photoURL || undefined,
                                    createdAt: Timestamp.now(),
                                    updatedAt: Timestamp.now(),
                                });

                                const newProfile = await getUserProfile(user.uid);
                                if (newProfile.success && newProfile.data) {
                                    setProfile(newProfile.data);
                                }
                            } catch (createError) {
                                console.warn('Could not create profile in Firestore:', createError);
                                // Still allow user to proceed without Firestore profile
                                setProfile({
                                    uid: user.uid,
                                    email: user.email || '',
                                    displayName: user.displayName || '',
                                    photoURL: user.photoURL || undefined,
                                    currency: 'INR',
                                    preferences: { theme: 'dark', notifications: true, riskTolerance: 'medium' },
                                    createdAt: Timestamp.now(),
                                    updatedAt: Timestamp.now(),
                                });
                            }
                        }
                    } catch (error) {
                        console.warn('Could not fetch profile from Firestore:', error);
                        // Still allow user to proceed without Firestore profile
                        setProfile({
                            uid: user.uid,
                            email: user.email || '',
                            displayName: user.displayName || '',
                            photoURL: user.photoURL || undefined,
                            currency: 'INR',
                            preferences: { theme: 'dark', notifications: true, riskTolerance: 'medium' },
                            createdAt: Timestamp.now(),
                            updatedAt: Timestamp.now(),
                        });
                    }
                } else {
                    setProfile(null);
                }

                setLoading(false);
            });
        } catch (error) {
            // Firebase unreachable (e.g. auth/configuration-not-found) — fall
            // back to no session; the demo login still works.
            console.warn('Firebase auth unavailable:', error);
            setUser(null);
            setProfile(null);
            setLoading(false);
        }

        return () => unsubscribe?.();
    }, [setUser, setProfile, setLoading]);

    return <>{children}</>;
}
