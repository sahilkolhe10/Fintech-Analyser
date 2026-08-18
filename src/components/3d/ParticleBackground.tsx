'use client';

// Animated Particle Background with Three.js
import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface ParticlesProps {
    count?: number;
    color?: string;
    size?: number;
}

function Particles({ count = 3000, color = '#8B5CF6', size = 0.003 }: ParticlesProps) {
    const ref = useRef<THREE.Points>(null);

    // Generate once, outside render (lazy initializer), to keep render pure.
    const [positions] = useState(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            arr[i3] = (Math.random() - 0.5) * 10;
            arr[i3 + 1] = (Math.random() - 0.5) * 10;
            arr[i3 + 2] = (Math.random() - 0.5) * 10;
        }
        return arr;
    });

    useFrame((state) => {
        if (ref.current) {
            ref.current.rotation.x = state.clock.elapsedTime * 0.02;
            ref.current.rotation.y = state.clock.elapsedTime * 0.03;
        }
    });

    return (
        <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
            <PointMaterial
                transparent
                color={color}
                size={size}
                sizeAttenuation={true}
                depthWrite={false}
                opacity={0.8}
            />
        </Points>
    );
}

interface ParticleBackgroundProps {
    particleCount?: number;
    primaryColor?: string;
    secondaryColor?: string;
}

export function ParticleBackground({
    particleCount = 3000,
    primaryColor = '#8B5CF6',
    secondaryColor = '#06B6D4',
}: ParticleBackgroundProps) {
    return (
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#0F0F1A] to-[#1a1a2e]">
            <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
                <ambientLight intensity={0.5} />
                <Particles count={particleCount} color={primaryColor} size={0.003} />
                <Particles count={particleCount / 2} color={secondaryColor} size={0.002} />
            </Canvas>
        </div>
    );
}
