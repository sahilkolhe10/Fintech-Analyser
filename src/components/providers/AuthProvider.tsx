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
        const unsubscribe = subscribeToAuthChanges(async (user) => {
            setUser(user);

            if (user) {
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
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                    });
                }
            } else {
                setProfile(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUser, setProfile, setLoading]);

    return <>{children}</>;
}
