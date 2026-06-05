/**
 * useDeformShader — patches every MeshStandardMaterial in a GLB scene graph
 * with a custom GLSL deformation stage injected via onBeforeCompile.
 *
 * All deformations are GPU-side: the original geometry buffer is never mutated,
 * so they are fully non-destructive and update in real time as sliders move.
 *
 * Deformations are normalized by the scene's world-space height — a Twist=0.5
 * on a tall sword and a Twist=0.5 on a small chest produce visually equivalent
 * twist amounts. Without this, raw vertex Y put models of different size into
 * wildly different deformation regimes.
 *
 * Order applied in vertex shader, after base vertex transform:
 *   1. Taper  — scale XZ linearly from bottom to top
 *   2. Twist  — rotate around Y proportional to height
 *   3. Bend   — displace X quadratically along Y (with normal correction)
 *   4. Smooth — softens all deformations toward neutral
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { TransformState } from '../../types'

interface PatchedMaterial extends THREE.MeshStandardMaterial {
  _deformShader?: THREE.WebGLProgramParametersWithUniforms
}

const DEFORM_VERT_GLSL = /* glsl */`
  uniform float uTwist;
  uniform float uTaper;
  uniform float uBend;
  uniform float uSmooth;
  uniform float uHalfHeight; // half the model's local Y extent — used to normalize deformations
`

// yNorm ranges from roughly -1 (bottom) to +1 (top) for any model size.
// This is the key to making slider values feel consistent across assets.
const DEFORM_BODY_GLSL = /* glsl */`
  float yNorm = transformed.y / max(uHalfHeight, 0.01);

  // ── Taper ───────────────────────────────────────────────────────────────
  float taperScale = 1.0 + uTaper * (yNorm * 0.5 + 0.5);
  transformed.x *= taperScale;
  transformed.z *= taperScale;

  // ── Twist ────────────────────────────────────────────────────────────────
  float twistAngle = uTwist * yNorm * 1.5;
  float ca = cos(twistAngle);
  float sa = sin(twistAngle);
  float tx = ca * transformed.x - sa * transformed.z;
  float tz = sa * transformed.x + ca * transformed.z;
  transformed.x = tx;
  transformed.z = tz;
  float nx2 = ca * objectNormal.x - sa * objectNormal.z;
  float nz2 = sa * objectNormal.x + ca * objectNormal.z;
  objectNormal.x = nx2;
  objectNormal.z = nz2;

  // ── Bend ─────────────────────────────────────────────────────────────────
  float bendDisplace = uBend * yNorm * yNorm * uHalfHeight * 0.6;
  transformed.x += bendDisplace;
  objectNormal.x += uBend * yNorm * 0.8;
  objectNormal = normalize(objectNormal);

  // ── Smooth ───────────────────────────────────────────────────────────────
  // Pulls deformed point back toward original by uSmooth (0=no relax, 1=full reset).
  vec3 originalLocal = position;
  transformed = mix(transformed, originalLocal, uSmooth);
`

function measureSceneHeight(root: THREE.Object3D): number {
  // Use the world-space bbox so the deformation strength matches what the user
  // sees after Center has positioned the model.
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)
  return Math.max(size.y, 0.01)
}

export function useDeformShader(
  scene: THREE.Group | THREE.Object3D | null,
  transforms: TransformState,
): void {
  const tRef = useRef(transforms)
  tRef.current = transforms

  useEffect(() => {
    if (!scene) return

    const halfHeight = measureSceneHeight(scene) * 0.5
    const materials: PatchedMaterial[] = []

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((mat) => {
        const m = mat as PatchedMaterial
        if (!(m instanceof THREE.MeshStandardMaterial)) return
        if (m._deformShader) {
          materials.push(m)
          return
        }

        m.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>\n${DEFORM_VERT_GLSL}`,
          )
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n${DEFORM_BODY_GLSL}`,
          )

          const t = tRef.current
          shader.uniforms.uTwist = { value: t.twist }
          shader.uniforms.uTaper = { value: t.taper }
          shader.uniforms.uBend = { value: t.bend }
          shader.uniforms.uSmooth = { value: t.smooth }
          shader.uniforms.uHalfHeight = { value: halfHeight }

          m._deformShader = shader
        }

        m.needsUpdate = true
        materials.push(m)
      })
    })

    return () => {
      materials.forEach((m) => {
        m.onBeforeCompile = () => {}
        m._deformShader = undefined
        m.needsUpdate = true
      })
    }
  }, [scene])

  useEffect(() => {
    if (!scene) return
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((mat) => {
        const m = mat as PatchedMaterial
        const s = m._deformShader
        if (!s) return
        s.uniforms.uTwist.value = transforms.twist
        s.uniforms.uTaper.value = transforms.taper
        s.uniforms.uBend.value = transforms.bend
        s.uniforms.uSmooth.value = transforms.smooth
      })
    })
  }, [scene, transforms.twist, transforms.taper, transforms.bend, transforms.smooth])
}
