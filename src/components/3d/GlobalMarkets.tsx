'use client';

// Interactive 3D Globe showing global market data with Earth texture
import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Sphere, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface MarketLocation {
    name: string;
    lat: number;
    lng: number;
    index: string;
    change: number;
    changePercent: number;
}

const DEFAULT_MARKETS: MarketLocation[] = [
    { name: 'Mumbai', lat: 19.076, lng: 72.877, index: 'SENSEX', change: 380, changePercent: 0.51 },
    { name: 'New York', lat: 40.7128, lng: -74.006, index: 'S&P 500', change: 12, changePercent: 0.24 },
    { name: 'London', lat: 51.5074, lng: -0.1278, index: 'FTSE 100', change: -25, changePercent: -0.32 },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503, index: 'Nikkei 225', change: 145, changePercent: 0.45 },
    { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, index: 'Hang Seng', change: -120, changePercent: -0.75 },
    { name: 'Shanghai', lat: 31.2304, lng: 121.4737, index: 'SSE', change: 15, changePercent: 0.18 },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093, index: 'ASX 200', change: 45, changePercent: 0.62 },
    { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, index: 'DAX', change: 85, changePercent: 0.48 },
];

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
}

interface MarkerProps {
    market: MarketLocation;
    radius: number;
    onClick?: (market: MarketLocation) => void;
}

function Marker({ market, radius, onClick }: MarkerProps) {
    const position = useMemo(() => latLngToVector3(market.lat, market.lng, radius), [market, radius]);
    const [hovered, setHovered] = useState(false);
    const color = market.changePercent >= 0 ? '#10B981' : '#EF4444';

    return (
        <group position={position}>
            <mesh
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
                onClick={() => onClick?.(market)}
            >
                <sphereGeometry args={[0.025, 16, 16]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 1.5 : 0.8} />
            </mesh>
            <mesh position={[0, 0, 0]}>
                <ringGeometry args={[0.03, 0.035, 32]} />
                <meshBasicMaterial color={color} side={THREE.DoubleSide} transparent opacity={0.6} />
            </mesh>
            {hovered && (
                <Html distanceFactor={10} zIndexRange={[100, 0]}>
                    <div className="bg-black/80 backdrop-blur-md p-3 rounded-lg text-white text-xs border border-white/10 whitespace-nowrap -translate-y-8 pointer-events-none">
                        <div className="font-bold flex items-center gap-2">
                            {market.name}
                            <span className="text-[10px] text-gray-400 font-normal">{market.index}</span>
                        </div>
                        <div className={`mt-1 font-mono ${market.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {market.changePercent >= 0 ? '+' : ''}{market.changePercent.toFixed(2)}%
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

interface GlobeProps {
    markets?: MarketLocation[];
    onMarketClick?: (market: MarketLocation) => void;
}

function Globe({ markets = DEFAULT_MARKETS, onMarketClick }: GlobeProps) {
    const globeRef = useRef<THREE.Mesh>(null);
    const radius = 1.2;

    // Load textures
    const [colorMap] = useLoader(THREE.TextureLoader, [
        'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg'
    ]);

    useFrame(() => {
        if (globeRef.current) {
            globeRef.current.rotation.y += 0.0005;
        }
    });

    return (
        <group ref={globeRef}>
            {/* Earth Sphere */}
            <Sphere args={[radius, 64, 64]}>
                <meshStandardMaterial
                    map={colorMap}
                    roughness={0.7}
                    metalness={0.1}
                />
            </Sphere>

            {/* Atmosphere Glow */}
            <Sphere args={[radius + 0.02, 64, 64]}>
                <meshStandardMaterial
                    color="#4F46E5"
                    transparent
                    opacity={0.15}
                    side={THREE.BackSide}
                    blending={THREE.AdditiveBlending}
                />
            </Sphere>

            {/* Markers */}
            {markets.map((market) => (
                <Marker key={market.name} market={market} radius={radius} onClick={onMarketClick} />
            ))}
        </group>
    );
}

interface GlobalMarketsProps {
    markets?: MarketLocation[];
    onMarketClick?: (market: MarketLocation) => void;
    className?: string;
}

export function GlobalMarkets({ markets, onMarketClick, className = '' }: GlobalMarketsProps) {
    return (
        <div className={`w-full h-full min-h-[350px] ${className}`}>
            <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }}>
                <ambientLight intensity={0.4} />
                <pointLight position={[10, 10, 10]} intensity={1.5} />
                <pointLight position={[-10, 5, -10]} intensity={0.5} />
                <Globe markets={markets} onMarketClick={onMarketClick} />
                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    autoRotate
                    autoRotateSpeed={0.5}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI / 1.5}
                />
            </Canvas>
        </div>
    );
}

export type { MarketLocation };
