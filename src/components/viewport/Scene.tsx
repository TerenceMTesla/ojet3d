import { Suspense, useRef, useMemo, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  Center,
  Bounds,
  useBounds,
  useGLTF,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei'
import { useStudio } from '../../store'
import type { TransformState } from '../../types'
import { useDeformShader } from './useDeformShader'
import * as THREE from 'three'

function Model({ url, transforms }: { url: string; transforms: TransformState }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef<THREE.Group>(null)

  // Stable clone — only recreates when the GLB source changes, not on every slider update.
  // This ensures onBeforeCompile fires once and uniform updates land on the compiled shader.
  const cloned = useMemo(() => scene.clone(true), [scene])

  useDeformShader(cloned, transforms)

  return (
    <Center>
      <group ref={groupRef}>
        <primitive
          object={cloned}
          scale={[transforms.scaleX, transforms.scaleY, transforms.scaleZ]}
        />
      </group>
    </Center>
  )
}

/**
 * AutoFit — calls bounds.refresh().fit() once after the model loads so that
 * each new asset starts framed regardless of its native scale or aspect.
 */
function AutoFit({ trigger }: { trigger: string }) {
  const bounds = useBounds()
  useEffect(() => {
    const t = setTimeout(() => bounds.refresh().clip().fit(), 80)
    return () => clearTimeout(t)
  }, [trigger, bounds])
  return null
}

function EmptyState() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7c3aed" wireframe />
    </mesh>
  )
}

function FrameButton() {
  // Programmatic refit, exposed via window for the toolbar to call
  const { camera, controls } = useThree(state => ({
    camera: state.camera,
    controls: state.controls,
  }))
  useEffect(() => {
    (window as unknown as { __ojet3dFitCamera?: () => void }).__ojet3dFitCamera = () => {
      camera.position.set(0, 1.5, 4)
      camera.lookAt(0, 0, 0)
      ;(controls as { reset?: () => void } | null)?.reset?.()
    }
  }, [camera, controls])
  return null
}

export default function Scene() {
  const { assets, activeAssetId } = useStudio()
  const active = assets.find((a) => a.id === activeAssetId)

  return (
    <Canvas
      camera={{ position: [0, 1.5, 4], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0a0a0f' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <pointLight position={[-4, 4, -4]} intensity={0.6} color="#7c3aed" />

      <Suspense fallback={<EmptyState />}>
        {active?.glbUrl ? (
          <Bounds clip observe margin={1.2}>
            <AutoFit trigger={active.id} />
            <Model key={active.id} url={active.glbUrl} transforms={active.transforms} />
          </Bounds>
        ) : (
          <EmptyState />
        )}
      </Suspense>

      <OrbitControls makeDefault enablePan enableZoom enableRotate />
      <Environment preset="city" />
      <FrameButton />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
      </GizmoHelper>

      <gridHelper args={[20, 20, '#1e1e2e', '#111118']} position={[0, -1.5, 0]} />
    </Canvas>
  )
}
