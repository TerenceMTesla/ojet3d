import { Suspense, useMemo, useEffect, useState } from 'react'
import { Canvas, useThree, useLoader } from '@react-three/fiber'
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
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useStudio } from '../../store'
import { useUpload } from '../../hooks/useUpload'
import type { Asset, TransformState } from '../../types'
import { useDeformShader } from './useDeformShader'
import * as THREE from 'three'

// ── GLB / GLTF ───────────────────────────────────────────────────────────────

function GlbModel({ url, transforms }: { url: string; transforms: TransformState }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  useDeformShader(cloned, transforms)
  return (
    <Center>
      <primitive
        object={cloned}
        scale={[transforms.scaleX, transforms.scaleY, transforms.scaleZ]}
      />
    </Center>
  )
}

// ── OBJ ──────────────────────────────────────────────────────────────────────

function ObjModel({ url, transforms }: { url: string; transforms: TransformState }) {
  const obj = useLoader(OBJLoader, url)
  const cloned = useMemo(() => obj.clone(), [obj])
  useDeformShader(cloned, transforms)
  return (
    <Center>
      <primitive
        object={cloned}
        scale={[transforms.scaleX, transforms.scaleY, transforms.scaleZ]}
      />
    </Center>
  )
}

// ── STL ──────────────────────────────────────────────────────────────────────

function StlModel({ url, transforms }: { url: string; transforms: TransformState }) {
  const geometry = useLoader(STLLoader, url)
  return (
    <Center>
      <mesh
        geometry={geometry}
        scale={[transforms.scaleX, transforms.scaleY, transforms.scaleZ]}
      >
        <meshStandardMaterial color="#a78bfa" metalness={0.4} roughness={0.5} />
      </mesh>
    </Center>
  )
}

// ── Image plane ──────────────────────────────────────────────────────────────

function ImagePlane({ url, transforms }: { url: string; transforms: TransformState }) {
  const texture = useMemo(() => new THREE.TextureLoader().load(url), [url])
  return (
    <Center>
      <mesh scale={[transforms.scaleX, transforms.scaleY, transforms.scaleZ]}>
        <planeGeometry args={[3, 3]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent />
      </mesh>
    </Center>
  )
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function AssetModel({ asset }: { asset: Asset }) {
  const url = asset.glbUrl!
  const ft = asset.fileType ?? 'glb'
  const t = asset.transforms

  if (ft === 'obj') return <ObjModel url={url} transforms={t} />
  if (ft === 'stl') return <StlModel url={url} transforms={t} />
  if (ft === 'image') return <ImagePlane url={url} transforms={t} />
  return <GlbModel url={url} transforms={t} />
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function AutoFit({ trigger }: { trigger: string }) {
  const bounds = useBounds()
  useEffect(() => {
    const t = setTimeout(() => bounds.refresh().clip().fit(), 80)
    return () => clearTimeout(t)
  }, [trigger, bounds])
  return null
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <group onClick={onUpload}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#7c3aed" wireframe />
      </mesh>
    </group>
  )
}

function FrameButton() {
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

// ── Drop zone overlay (outside Canvas) ──────────────────────────────────────
// Uses pointer-events:none normally so OrbitControls works.
// Only activates when a drag enters the window.

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) setDragging(true) }
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false) }
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  if (!dragging) return null

  return (
    <div
      className="absolute inset-0 z-10 bg-studio-accent/10 border-2 border-dashed border-studio-accent flex items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <span className="text-studio-accent text-sm font-medium pointer-events-none">Drop file to load</span>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function Scene() {
  const { assets, activeAssetId } = useStudio()
  const active = assets.find((a) => a.id === activeAssetId)
  const { openPicker, handleFile } = useUpload()

  return (
    <div className="relative w-full h-full">
      <DropZone onFile={handleFile} />
      <Canvas
        camera={{ position: [0, 1.5, 4], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0a0a0f' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <pointLight position={[-4, 4, -4]} intensity={0.6} color="#7c3aed" />

        <Suspense fallback={<EmptyState onUpload={openPicker} />}>
          {active?.glbUrl ? (
            <Bounds clip observe margin={1.2}>
              <AutoFit trigger={active.id} />
              <AssetModel key={active.id} asset={active} />
            </Bounds>
          ) : (
            <EmptyState onUpload={openPicker} />
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
    </div>
  )
}
