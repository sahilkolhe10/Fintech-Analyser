'use client';

// 3D Interactive Portfolio Pie Chart
import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface PieSlice {
    label: string;
    value: number;
    color: string;
}

interface SliceProps {
    slice: PieSlice;
    startAngle: number;
    endAngle: number;
    index: number;
    onHover: (slice: PieSlice | null) => void;
}

function Slice({ slice, startAngle, endAngle, index, onHover }: SliceProps) {
    const ref = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);

    const geometry = useMemo(() => {
        const shape = new THREE.Shape();
        const radius = 1;
        const innerRadius = 0.4;
        shape.moveTo(Math.cos(startAngle) * innerRadius, Math.sin(startAngle) * innerRadius);
        shape.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
        const segments = 32;
        const angleStep = (endAngle - startAngle) / segments;
        for (let i = 1; i <= segments; i++) {
            const angle = startAngle + angleStep * i;
            shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        shape.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius);
        for (let i = segments; i >= 0; i--) {
            const angle = startAngle + angleStep * i;
            shape.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
        }
        const extrudeSettings = { depth: 0.3, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.02, bevelThickness: 0.02 };
        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    }, [startAngle, endAngle]);

    useFrame(() => {
        if (ref.current) {
            const targetY = hovered ? 0.1 : 0;
            ref.current.position.y += (targetY - ref.current.position.y) * 0.1;
        }
    });

    return (
        <mesh
            ref={ref}
            geometry={geometry}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={() => { setHovered(true); onHover(slice); }}
            onPointerOut={() => { setHovered(false); onHover(null); }}
        >
            <meshStandardMaterial color={slice.color} emissive={slice.color} emissiveIntensity={hovered ? 0.3 : 0.1} />
        </mesh>
    );
}

interface Portfolio3DPieProps {
    data: PieSlice[];
    className?: string;
    showLabels?: boolean;
}

export function Portfolio3DPie({ data, className = '', showLabels = true }: Portfolio3DPieProps) {
    const [hoveredSlice, setHoveredSlice] = useState<PieSlice | null>(null);
    const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

    const slices = useMemo(() => {
        let currentAngle = 0;
        return data.map((slice) => {
            const startAngle = currentAngle;
            const angle = (slice.value / total) * Math.PI * 2;
            currentAngle += angle;
            return { slice, startAngle, endAngle: currentAngle };
        });
    }, [data, total]);

    return (
        <div className={`relative w-full h-full min-h-[300px] ${className}`}>
            <Canvas camera={{ position: [0, 2, 2], fov: 50 }}>
                <ambientLight intensity={0.6} />
                <pointLight position={[5, 5, 5]} intensity={1} />
                <pointLight position={[-5, 5, -5]} intensity={0.5} />
                <group rotation={[0.2, 0, 0]}>
                    {slices.map((s, i) => (
                        <Slice key={s.slice.label} slice={s.slice} startAngle={s.startAngle} endAngle={s.endAngle} index={i} onHover={setHoveredSlice} />
                    ))}
                </group>
                <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1} />
            </Canvas>
            {hoveredSlice && (
                <div className="absolute top-4 left-4 glassmorphism p-3 rounded-lg">
                    <div className="font-bold text-white">{hoveredSlice.label}</div>
                    <div className="text-gray-300">{((hoveredSlice.value / total) * 100).toFixed(1)}%</div>
                </div>
            )}
            {showLabels && (
                <div className="absolute bottom-4 right-4 flex flex-wrap gap-2">
                    {data.map((d) => (
                        <div key={d.label} className="flex items-center gap-1 text-xs text-gray-300">
                            <div className="w-3 h-3 rounded" style={{ backgroundColor: d.color }} />
                            {d.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export type { PieSlice };
