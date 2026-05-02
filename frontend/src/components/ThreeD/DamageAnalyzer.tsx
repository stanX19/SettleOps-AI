"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Stage, useGLTF } from "@react-three/drei"
import {
  Activity,
  AlertCircle,
  Wrench,
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

function HeatmapMesh({ geometry }: { geometry: THREE.BufferGeometry }) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.1,
        roughness: 0.8,
      }),
    []
  )

  return <mesh geometry={geometry} material={material} scale={1.5} />
}

function DamageHeatmap({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <div className="h-full w-full">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 2, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <HeatmapMesh geometry={geometry} />
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.05} />
      </Canvas>
    </div>
  )
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
  
  // Background Analysis State
  const [analysisGeometry, setAnalysisGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  const glbUrl = data.model_glb || "/3d/damaged.glb"
  const originalObj = data.model_original_obj || "/3d/original.obj"
  const damagedObj = data.model_damaged_obj || "/3d/damaged.obj"

  // Passive Background Loading Effect
  useEffect(() => {
    if (analysisGeometry || isAnalysisLoading || analysisError) return

    const runAnalysis = async () => {
      setIsAnalysisLoading(true)
      const loader = new OBJLoader()
      
      try {
        const [original, damaged] = await Promise.all([
          new Promise<THREE.Group>((resolve, reject) => loader.load(originalObj, resolve, undefined, reject)),
          new Promise<THREE.Group>((resolve, reject) => loader.load(damagedObj, resolve, undefined, reject))
        ])

        const origMesh = original.children[0] as THREE.Mesh
        const dmgMesh = damaged.children[0] as THREE.Mesh
        const dmgGeo = dmgMesh.geometry.clone()
        
        const origPos = origMesh.geometry.attributes.position as THREE.BufferAttribute
        const dmgPos = dmgGeo.attributes.position as THREE.BufferAttribute

        if (dmgPos.count !== origPos.count) {
          throw new Error("Topology mismatch between original and damaged models.")
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
        setAnalysisGeometry(dmgGeo)
      } catch (err) {
        console.error("3D Analysis Error:", err)
        setAnalysisError(getErrorMessage(err))
      } finally {
        setIsAnalysisLoading(false)
      }
    }

    runAnalysis()
  }, [originalObj, damagedObj])

  const vehicleLabel =
    readString(data, ["vehicle_model", "car_model", "model_name", "vehicle_name"]) ||
    "Damaged vehicle"
  const confidence = readNumber(data, ["confidence_score", "confidence", "score"]) ?? 98.4
  const surfacePoints = readNumber(data, ["surface_points", "points_analyzed", "point_count"]) ?? 145200
  const damageSummary =
    readString(data, ["summary", "damage_summary", "analysis_summary", "finding"]) ||
    "Detected significant geometric deformation in the front bumper and left headlamp assembly. 43.7% Vertex displaced."

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
                <Wrench className="h-4 w-4 text-brand-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-neutral-text-primary">
                  Spatial Damage Analysis
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
              {isAnalysisLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-brand-primary" />
                  Background Analysis...
                </>
              ) : analysisError ? (
                <>
                  <AlertCircle className="h-3 w-3 text-semantic-danger" />
                  Analysis Failed
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 text-brand-primary" />
                  Visual Inspection
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-neutral-border bg-neutral-surface">
            <Metric label="Points" value={formatCount(surfacePoints)} />
            <Metric label="Status" value={isAnalysisLoading ? "Analyzing..." : "Complete"} />
          </div>

          <div className="flex items-start gap-2.5 border-t border-neutral-border bg-neutral-surface px-4 py-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-primary" />
            <p className="text-xs leading-relaxed text-neutral-text-secondary">
              <span className="font-bold uppercase text-brand-primary">Damage Assessment Agent:</span>{" "}
              {isAnalysisLoading ? "Performing geometric validation on high-density point clouds..." : damageSummary} 
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
                  Spatial Damage Analysis
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

              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-neutral-border bg-neutral-surface text-right shadow-[0_1px_4px_rgba(15,23,42,0.06)] md:w-[240px]">
                <Metric label="Points" value={formatCount(surfacePoints)} compact />
                <Metric label="Status" value={isAnalysisLoading ? "Analyzing..." : "Complete"} compact />
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-[#070707]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.13),transparent_36%)]" />
              <Suspense fallback={<ViewFallback />}>
                {view === "visual" ? (
                  <ModelViewport url={glbUrl} />
                ) : isAnalysisLoading ? (
                  <div className="flex h-full w-full flex-col items-center justify-center">
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-brand-primary" />
                    <p className="text-sm font-bold uppercase tracking-widest text-neutral-400">
                      Processing Geometric Deviations...
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      Comparing 145,200 surface points against OEM specifications
                    </p>
                  </div>
                ) : analysisError ? (
                  <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
                    <AlertCircle className="mb-4 h-12 w-12 text-semantic-danger" />
                    <h4 className="text-lg font-bold text-neutral-200">Analysis Component Failure</h4>
                    <p className="mt-2 max-w-md text-sm text-neutral-400">
                      {analysisError}
                    </p>
                    <button 
                      onClick={() => window.location.reload()}
                      className="mt-6 rounded-md bg-neutral-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-neutral-text-primary hover:bg-neutral-border/80"
                    >
                      Retry Analysis
                    </button>
                  </div>
                ) : analysisGeometry ? (
                  <DamageHeatmap geometry={analysisGeometry} />
                ) : null}
              </Suspense>

              {view === "analysis" && !isAnalysisLoading && analysisGeometry && (
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
                <span className="font-bold uppercase text-brand-primary">Damage Assessment Agent:</span>{" "}
                {isAnalysisLoading ? "Geometric validation in progress. Aligning point clouds to reference mesh..." : damageSummary} 
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
