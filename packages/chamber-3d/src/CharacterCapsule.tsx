'use client';

/** Abstract capsule stand-in — fallback when a character has no portrait. */
export function CharacterCapsule({ isSelf }: { isSelf?: boolean }) {
  const body = isSelf ? '#c08552' : '#6b7a8f';
  const head = isSelf ? '#d8a070' : '#8595a8';
  return (
    <group>
      <mesh castShadow position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.3, 0.9, 8, 16]} />
        <meshStandardMaterial color={body} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.19, 16, 16]} />
        <meshStandardMaterial color={head} roughness={0.6} />
      </mesh>
    </group>
  );
}
