'use client';

// Sign Up Page
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signUpWithEmail, signInWithGoogle, signInAsDemo } from '@/lib/firebase/auth';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { ParticleBackground } from '@/components/3d/ParticleBackground';
import { Mail, Lock, User, Eye, EyeOff, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { DEMO_USER, DEMO_PASSWORD } from '@/services/demo';

export default function SignUpPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password) {
            toast.error('Please fill in all fields');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        // Demo credentials → local demo session (no Firebase)
        if (email.trim().toLowerCase() === DEMO_USER.email && password === DEMO_PASSWORD) {
            const demoResult = signInAsDemo();
            if (demoResult.success) {
                toast.success('Welcome to Demo Mode!');
                router.push('/');
            }
            return;
        }

        setIsLoading(true);
        const result = await signUpWithEmail(email, password, name);
        setIsLoading(false);

        if (result.success) {
            toast.success('Account created successfully!');
            router.push('/');
        } else {
            toast.error(result.error || 'Sign up failed');
        }
    };

    const handleGoogleSignUp = async () => {
        setIsLoading(true);
        const result = await signInWithGoogle();
        setIsLoading(false);

        if (result.success) {
            toast.success('Welcome to KhataHouse!');
            router.push('/');
        } else {
            toast.error(result.error || 'Google sign up failed');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <ParticleBackground particleCount={2000} />

            <GlassCard className="w-full max-w-md p-8" hover={false}>
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                        <span className="text-white font-bold text-2xl">K</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Create Account</h1>
                    <p className="text-gray-400 mt-1">Start your financial journey today</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Full name"
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none transition-colors"
                        />
                    </div>

                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email address"
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:border-primary focus:outline-none transition-colors"
                        />
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password (min 6 characters)"
                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white placeholder-gray-400 focus:border-primary focus:outline-none transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>

                    <AnimatedButton type="submit" className="w-full" loading={isLoading}>
                        Create Account
                    </AnimatedButton>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-gray-400 text-sm">or continue with</span>
                    <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Social Login */}
                <AnimatedButton variant="secondary" className="w-full" onClick={handleGoogleSignUp}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </AnimatedButton>

                {/* Demo Mode */}
                <div className="my-4">
                    <AnimatedButton
                        variant="secondary"
                        className="w-full !border-primary/40 !text-primary hover:!bg-primary/10"
                        onClick={() => {
                            const result = signInAsDemo();
                            if (result.success) {
                                toast.success('Welcome to Demo Mode!');
                                router.push('/');
                            }
                        }}
                    >
                        <Sparkles className="w-5 h-5" />
                        Explore Demo Mode
                    </AnimatedButton>
                    <p className="text-center text-xs text-gray-500 mt-2">
                        No account needed — demo user: <span className="text-gray-300 font-mono">{DEMO_USER.email}</span> / <span className="text-gray-300 font-mono">{DEMO_PASSWORD}</span>
                    </p>
                </div>

                {/* Terms */}
                <p className="text-center text-gray-400 text-sm mt-6">
                    By signing up, you agree to our{' '}
                    <Link href="/terms" className="text-primary hover:underline">Terms</Link>
                    {' '}and{' '}
                    <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </p>

                {/* Login Link */}
                <p className="text-center text-gray-400 mt-4">
                    Already have an account?{' '}
                    <Link href="/login" className="text-primary hover:underline font-medium">
                        Sign in
                    </Link>
                </p>
            </GlassCard>
        </div>
    );
}
