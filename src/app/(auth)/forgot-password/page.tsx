'use client';

// Forgot Password Page
import { useState } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/firebase/auth';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { ParticleBackground } from '@/components/3d/ParticleBackground';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast.error('Please enter your email address');
            return;
        }

        setIsLoading(true);
        const result = await resetPassword(email);
        setIsLoading(false);

        if (result.success) {
            setSent(true);
            toast.success('Password reset email sent!');
        } else {
            toast.error(result.error || 'Failed to send reset email');
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
                    <h1 className="text-2xl font-bold text-white">Reset Password</h1>
                    <p className="text-gray-400 mt-1">
                        {sent ? 'Check your inbox' : 'Enter your email to receive a reset link'}
                    </p>
                </div>

                {sent ? (
                    <div className="text-center space-y-4">
                        <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
                        <p className="text-gray-300 text-sm">
                            If an account exists for <span className="text-white font-medium">{email}</span>, a
                            password reset link has been sent. Check your inbox (and spam folder).
                        </p>
                        <Link href="/login" className="block text-primary hover:underline text-sm">
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
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

                        <AnimatedButton type="submit" className="w-full" loading={isLoading}>
                            Send Reset Link
                        </AnimatedButton>

                        <Link
                            href="/login"
                            className="flex items-center justify-center gap-2 text-gray-400 hover:text-white text-sm transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to sign in
                        </Link>
                    </form>
                )}
            </GlassCard>
        </div>
    );
}
