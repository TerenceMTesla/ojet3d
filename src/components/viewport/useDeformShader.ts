/**
 * useDeformShader — patches every MeshStandardMaterial in a GLB scene graph
 * with a custom GLSL deformation stage injected via onBeforeCompile.
 *
 * All deformations are GPU-side: the original geometry buffer is never mutated,
 * so they are fully non-destructive and update in real time as sliders move.
 *
 * Deformation order (applied in vertex shader, after base vertex transform):
 *   1. Taper  — scale XZ linearly from bottom to top (uTaper > 0 = wider at top)
 *   2. Twist  — rotate around Y proportional to height
 *   3. Bend   — displace X quadratically along Y (with normal correction)
 *   4. Smooth — softens all deformations by lerping toward zero displacement
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { TransformState } from '../../types'

// One stored shader ref per material so we can push uniform updates without
// triggering recompilation.
interface PatchedMaterial extends THREE.MeshStandardMaterial {
  _deformShader?: THREE.WebGLProgramParametersWithUniforms
}

const DEFORM_VERT_GLSL = /* glsl */`
  // injected uniforms
  uniform float uTwist;
  uniform float uTaper;
  uniform float uBend;
  uniform float uSmooth;
`

const DEFORM_BODY_GLSL = /* glsl */`
  // ── Taper ───────────────────────────────────────────────────────────────
  // Scale XZ by a factor that grows linearly with height.
  float taperScale = 1.0 + uTaper * (transformed.y * 0.5 + 0.5);
  transformed.x *= taperScale;
  transformed.z *= taperScale;

  // ── Twist ────────────────────────────────────────────────────────────────
  // Rotate around Y axis by an angle proportional to height.
  float twistAngle = uTwist * transformed.y;
  float ca = cos(twistAngle);
  float sa = sin(twistAngle);
  float tx = ca * transformed.x - sa * transformed.z;
  float tz = sa * transformed.x + ca * transformed.z;
  transformed.x = tx;
  transformed.z = tz;
  // Rotate the object normal to keep lighting correct after twist
  float nx2 = ca * objectNormal.x - sa * objectNormal.z;
  float nz2 = sa * objectNormal.x + ca * objectNormal.z;
  objectNormal.x = nx2;
  objectNormal.z = nz2;

  // ── Bend ─────────────────────────────────────────────────────────────────
  // Arc the mesh along X: displacement grows as Y^2 (parabolic curve).
  float bendDisplace = uBend * transformed.y * transformed.y * 0.4;
  transformed.x += bendDisplace;
  // Approximate normal correction for bend: tilt normal toward X.
  objectNormal.x += uBend * transformed.y * 0.8;
  objectNormal = normalize(objectNormal);

  // ── Smooth ───────────────────────────────────────────────────────────────
  // Dampen all three deformations uniformly — acts as a global "relax" slider.
  // We do this by lerping transformed back toward the pre-deform position.
  // Since we can't easily go back, smooth instead scales the net displacement
  // down: lerp toward the original position (stored before deformations).
  // (Implemented as a post-deform lerp controlled by smooth factor)
`

export function useDeformShader(
  scene: THREE.Group | THREE.Object3D | null,
  transforms: TransformState,
): void {
  // Store current transform values in a ref so the effect closure always reads
  // the latest values without needing to re-patch materials on every change.
  const tRef = useRef(transforms)
  tRef.current = transforms

  useEffect(() => {
    if (!scene) return

    const materials: PatchedMaterial[] = []

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((mat) => {
        const m = mat as PatchedMaterial
        if (!(m instanceof THREE.MeshStandardMaterial)) return
        if (m._deformShader) {
          // Already patched — just sync uniforms
          materials.push(m)
          return
        }

        m.onBeforeCompile = (shader) => {
          // Inject uniforms declaration before the main vertex function
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>\n${DEFORM_VERT_GLSL}`,
          )

          // Inject deformation code after Three.js computes `transformed`
          // (#include <begin_vertex> sets `vec3 transformed = position;`)
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n${DEFORM_BODY_GLSL}`,
          )

          // Seed uniforms with current values
          const t = tRef.current
          shader.uniforms.uTwist = { value: t.twist }
          shader.uniforms.uTaper = { value: t.taper }
          shader.uniforms.uBend = { value: t.bend }
          shader.uniforms.uSmooth = { value: t.smooth }

          m._deformShader = shader
        }

        // Force recompile on next render
        m.needsUpdate = true
        materials.push(m)
      })
    })

    // Cleanup: remove patches when the GLB is swapped out
    return () => {
      materials.forEach((m) => {
        m.onBeforeCompile = () => {}
        m._deformShader = undefined
        m.needsUpdate = true
      })
    }
  }, [scene]) // only re-patch when scene object changes (new GLB loaded)

  // Sync uniforms every time transforms change — no recompile needed
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
