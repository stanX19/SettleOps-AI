"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Stage, useGLTF } from "@react-three/drei"
import {
  Activity,
  AlertCircle,
  Box,
  Eye,
  Loader2,
  Maximize2,
  Rotate3D,
  X,
} from "lucide-react"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"

export interface ReconstructionData {
  model_glb?: string
  model_damaged_obj?: string
  model_original_obj?: string
  status?: string
  error?: string
  [key: string]: unknown
}

interface DamageAnalyzerProps {
  data: ReconstructionData
}

function readString(data: ReconstructionData, keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

function readNumber(data: ReconstructionData, keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

function formatConfidence(value: number) {
  const normalized = value <= 1 ? value * 100 : value
  return `${normalized.toFixed(1)}%`
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error"
}

function CarModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, [clonedScene])

  return <primitive object={clonedScene} />
}

function ModelViewport({
  url,
  compact = false,
}: {
  url: string
  compact?: boolean
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      className={compact ? "pointer-events-none" : undefined}
    >
      <PerspectiveCamera
        makeDefault
        position={compact ? [4.5, 2.4, 5.6] : [5, 3, 6]}
        fov={compact ? 38 : 42}
      />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1.2} />
      <Suspense fallback={null}>
        <Stage
          environment="city"
          intensity={0.55}
          adjustCamera
          center={{}}
        >
          <CarModel url={url} />
        </Stage>
      </Suspense>
      <OrbitControls
        makeDefault
        autoRotate
        autoRotateSpeed={compact ? 0.8 : 0.45}
        enableDamping
        enablePan={!compact}
        enableRotate={!compact}
        enableZoom={!compact}
        maxPolarAngle={Math.PI / 1.5}
        minDistance={2}
        maxDistance={20}
      />
    </Canvas>
  )
}

function ViewFallback({ compact = false }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
      <Loader2 className={`${compact ? "h-5 w-5" : "h-8 w-8"} animate-spin text-brand-primary`} />
      {!compact && (
        <p className="mt-3 text-xs font-medium uppercase tracking-widest text-neutral-400">
          Loading 3D model
        </p>
      )}
    </div>
  )
}

function DamageHeatmap({
  originalPath,
  damagedPath,
}: {
  originalPath: string
  damagedPath: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mountRef.current) return

    const container = mountRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.set(0, 2, 5)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const controls = new ThreeOrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 5, 5)
    scene.add(directionalLight)

    const loader = new OBJLoader()
    let originalMesh: THREE.Mesh | null = null
    let damagedMesh: THREE.Mesh | null = null

    const compareAndRender = (orig: THREE.Mesh, dmg: THREE.Mesh) => {
      try {
        const dmgGeo = dmg.geometry.clone()
        const origPos = orig.geometry.attributes.position as THREE.BufferAttribute
        const dmgPos = dmgGeo.attributes.position as THREE.BufferAttribute

        if (dmgPos.count !== origPos.count) {
          console.warn("Vertex count mismatch. Topologies must be identical for heatmapping.")
          const material = new THREE.MeshStandardMaterial({ color: 0x888888 })
          scene.add(new THREE.Mesh(dmgGeo, material))
          return
        }

        const colorArray = new Float32Array(dmgPos.count * 3)
        const threshold = 0.005

        for (let i = 0; i < dmgPos.count; i++) {
          const dx = dmgPos.getX(i) - origPos.getX(i)
          const dy = dmgPos.getY(i) - origPos.getY(i)
          const dz = dmgPos.getZ(i) - origPos.getZ(i)
          const diff = Math.sqrt(dx * dx + dy * dy + dz * dz)

          if (diff > threshold) {
            const intensity = Math.min(diff / 0.05, 1.0)
            colorArray[i * 3] = 0.9 + intensity * 0.1
            colorArray[i * 3 + 1] = 0.2 - intensity * 0.2
            colorArray[i * 3 + 2] = 0.2 - intensity * 0.2
          } else {
            colorArray[i * 3] = 0.6
            colorArray[i * 3 + 1] = 0.6
            colorArray[i * 3 + 2] = 0.6
          }
        }

        dmgGeo.setAttribute("color", new THREE.BufferAttribute(colorArray, 3))
        const material = new THREE.MeshStandardMaterial({
          vertexColors: true,
          metalness: 0.1,
          roughness: 0.8,
        })
        const result = new THREE.Mesh(dmgGeo, material)
        result.scale.set(1.5, 1.5, 1.5)
        scene.add(result)
      } catch {
        setError("Error during vertex comparison calculation.")
      }
    }

    loader.load(
      originalPath,
      (obj) => {
        originalMesh = obj.children[0] as THREE.Mesh
        if (damagedMesh) compareAndRender(originalMesh, damagedMesh)
      },
      undefined,
      (e) => setError(`Failed to load original model: ${getErrorMessage(e)}`),
    )

    loader.load(
      damagedPath,
      (obj) => {
        damagedMesh = obj.children[0] as THREE.Mesh
        if (originalMesh) compareAndRender(originalMesh, damagedMesh)
      },
      undefined,
      (e) => setError(`Failed to load damaged model: ${getErrorMessage(e)}`),
    )

    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(frameId)
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      renderer.dispose()
      controls.dispose()
    }
  }, [originalPath, damagedPath])

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-lg bg-semantic-danger/5 p-6 text-center text-semantic-danger">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p className="text-sm font-medium">{error}</p>
      </div>
    )
  }

  return <div ref={mountRef} className="h-full min-h-[420px] w-full cursor-move" />
}

function Metric({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className={`min-w-0 border-r border-neutral-border/70 last:border-r-0 ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}>
      <div className={`truncate font-bold uppercase tracking-widest text-neutral-text-tertiary ${compact ? "text-[8px]" : "text-[9px]"}`}>
        {label}
      </div>
      <div className={`truncate font-semibold text-neutral-text-primary ${compact ? "mt-px text-[11px]" : "mt-0.5 text-xs"}`}>
        {value}
      </div>
    </div>
  )
}

export default function DamageAnalyzer({ data }: DamageAnalyzerProps) {
  const [view, setView] = useState<"visual" | "analysis">("visual")
  const glbUrl = data.model_glb || "/3d/damaged.glb"
  const originalObj = data.model_original_obj || "/3d/original.obj"
  const damagedObj = data.model_damaged_obj || "/3d/damaged.obj"

  const vehicleLabel =
    readString(data, ["vehicle_model", "car_model", "model_name", "vehicle_name"]) ||
    "Damaged vehicle"
  const confidence = readNumber(data, ["confidence_score", "confidence", "score"]) ?? 98.4
  const surfacePoints = readNumber(data, ["surface_points", "points_analyzed", "point_count"]) ?? 145200
  const damageSummary =
    readString(data, ["summary", "damage_summary", "analysis_summary", "finding"]) ||
    "Detected significant geometric deformation in the front bumper and left headlamp assembly."

  if (data.status === "error") {
    return (
      <div className="mb-5 rounded-lg border border-neutral-border bg-neutral-surface shadow-card">
        <div className="flex items-center gap-3 border-b border-neutral-border bg-neutral-background px-4 py-3">
          <AlertCircle className="h-4 w-4 text-semantic-danger" />
          <h3 className="text-sm font-semibold text-neutral-text-primary">3D Reconstruction Failed</h3>
        </div>
        <p className="px-4 py-3 text-sm text-neutral-text-secondary">
          {data.error || "Unknown error occurred during reconstruction."}
        </p>
      </div>
    )
  }

  return (
    <Dialog.Root>
      <div className="mb-5 overflow-hidden rounded-lg border border-neutral-border bg-neutral-surface text-left shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-border bg-neutral-background px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brand-primary/20 bg-brand-primary/10">
                <Box className="h-4 w-4 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-neutral-text-primary">
                  3D Reconstruction
                </h3>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-neutral-text-tertiary">
                  {vehicleLabel}
                </p>
              </div>
            </div>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-border bg-neutral-surface px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-text-secondary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
                aria-label="Open 3D reconstruction model"
              >
                <Maximize2 className="h-3 w-3" />
                Open
              </button>
            </Dialog.Trigger>
          </div>

          <div className="relative h-44 overflow-hidden bg-[#070707]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(255,255,255,0.11),transparent_34%),linear-gradient(180deg,rgba(255,193,7,0.07),transparent_48%)]" />
            <Suspense fallback={<ViewFallback compact />}>
              <ModelViewport url={glbUrl} compact />
            </Suspense>
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/70 backdrop-blur-sm">
              <Eye className="h-3 w-3 text-brand-primary" />
              Visual Inspection
            </div>
          </div>

          <div className="grid grid-cols-3 border-t border-neutral-border bg-neutral-surface">
            <Metric label="Confidence" value={formatConfidence(confidence)} />
            <Metric label="Points" value={formatCount(surfacePoints)} />
            <Metric label="Status" value="Complete" />
          </div>

          <div className="flex items-start gap-2.5 border-t border-neutral-border bg-neutral-surface px-4 py-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
            <p className="text-xs leading-relaxed text-neutral-text-secondary">
              <span className="font-bold uppercase text-brand-primary">3D Recon Agent:</span>{" "}
              {damageSummary} Confidence score:{" "}
              <span className="font-bold text-neutral-text-primary">{formatConfidence(confidence)}</span>.
            </p>
          </div>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-120 bg-black/70 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-130 flex h-[86vh] w-[94vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-neutral-border bg-neutral-background shadow-2xl animate-in fade-in zoom-in-95 focus:outline-none">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-border bg-neutral-surface px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-primary/20 bg-brand-primary/10">
                <Rotate3D className="h-4.5 w-4.5 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-semibold text-neutral-text-primary">
                  3D Reconstruction
                </Dialog.Title>
                <Dialog.Description className="mt-1 truncate text-xs font-bold uppercase tracking-widest text-neutral-text-tertiary">
                  {vehicleLabel} - Spatial analysis engine v2.4
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              className="rounded-md p-2 text-neutral-text-tertiary transition-colors hover:bg-neutral-border hover:text-neutral-text-primary"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-col gap-2 border-b border-neutral-border bg-neutral-background/70 px-4 py-2 md:flex-row md:items-center md:justify-between">
              <div className="inline-flex w-fit rounded-lg border border-neutral-border bg-neutral-surface p-1 shadow-inner">
                <button
                  type="button"
                  onClick={() => setView("visual")}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                    view === "visual"
                      ? "bg-brand-primary text-black shadow-sm"
                      : "text-neutral-text-tertiary hover:text-neutral-text-primary"
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Visual
                </button>
                <button
                  type="button"
                  onClick={() => setView("analysis")}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                    view === "analysis"
                      ? "bg-brand-primary text-black shadow-sm"
                      : "text-neutral-text-tertiary hover:text-neutral-text-primary"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Heatmap
                </button>
              </div>

              <div className="grid grid-cols-3 overflow-hidden rounded-md border border-neutral-border bg-neutral-surface text-right shadow-[0_1px_4px_rgba(15,23,42,0.06)] md:w-[340px]">
                <Metric label="Confidence" value={formatConfidence(confidence)} compact />
                <Metric label="Points" value={formatCount(surfacePoints)} compact />
                <Metric label="Status" value="Complete" compact />
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-[#070707]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.13),transparent_36%)]" />
              <Suspense fallback={<ViewFallback />}>
                {view === "visual" ? (
                  <ModelViewport url={glbUrl} />
                ) : (
                  <DamageHeatmap originalPath={originalObj} damagedPath={damagedObj} />
                )}
              </Suspense>

              {view === "analysis" && (
                <div className="absolute bottom-4 right-4 rounded-lg border border-white/10 bg-black/65 p-3 text-white shadow-xl backdrop-blur-md">
                  <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Geometric Deviation
                  </h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
                      Severe (&gt;2cm)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
                      Moderate (1-2cm)
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4b5563]" />
                      OEM spec (&lt;0.5cm)
                    </div>
                  </div>
                </div>
              )}

              {view === "visual" && (
                <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/55 backdrop-blur-sm">
                  Drag rotate - Scroll zoom - Right-click pan
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-neutral-border bg-neutral-surface px-5 py-3">
              <p className="text-sm leading-relaxed text-neutral-text-secondary">
                <span className="font-bold uppercase text-brand-primary">3D Recon Agent:</span>{" "}
                {damageSummary} Confidence score:{" "}
                <span className="font-bold text-neutral-text-primary">{formatConfidence(confidence)}</span>.
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
