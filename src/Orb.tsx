import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { audioLevel } from "./audio";

export type Mode = "idle" | "listening" | "thinking" | "speaking" | "error";

// Төлөв бүрийн өнгө: [гол өнгө, ирмэгийн гэрэл]
const PALETTE: Record<Mode, [string, string]> = {
  idle: ["#1d7fd1", "#9eeaff"],
  listening: ["#11a88c", "#a6ffe3"],
  thinking: ["#5a43c9", "#d4c2ff"],
  speaking: ["#3d95e6", "#f0faff"],
  error: ["#a33a32", "#ffb3a6"],
};

// 3D simplex noise (Ashima Arts, MIT) — гадаргууг амьд мэт долгилуулна.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const vertexShader = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform float uSpeed;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
${NOISE}
void main(){
  float n = snoise(normal*1.6 + uTime*uSpeed);
  float n2 = snoise(normal*3.4 - uTime*uSpeed*1.3)*0.5;
  vNoise = n + n2;
  vec3 pos = position + normal * vNoise * uAmp;
  vec4 mv = modelViewMatrix * vec4(pos,1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uCore; uniform vec3 uRim; uniform float uGlow;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
void main(){
  float facing = max(dot(vNormal, vView), 0.0);
  float fres = pow(1.0 - facing, 2.0);
  vec3 col = mix(uCore, uRim, fres);
  // Дотоод цайвар цөм: голдоо гэрэлтэж байгаа мэт харагдуулна.
  col += uRim * pow(facing, 6.0) * 0.45;
  col += uRim * smoothstep(0.1, 0.9, vNoise) * 0.4;
  float alpha = clamp(0.78 + fres*0.4, 0.0, 1.0);
  gl_FragColor = vec4(col * (1.15 + uGlow*0.7), alpha);
}`;

// Арын гадаргуу дээр зурагдах тул төв хэсэгтээ тод, ирмэг рүүгээ бүдгэрнэ.
const haloFragment = /* glsl */ `
uniform vec3 uRim; uniform float uGlow;
varying vec3 vNormal; varying vec3 vView; varying float vNoise;
void main(){
  float i = pow(max(0.62 - dot(vNormal, vView), 0.0), 3.0);
  gl_FragColor = vec4(uRim, clamp(i * (0.55 + uGlow*0.7), 0.0, 1.0));
}`;

function Blob({ mode }: { mode: Mode }) {
  const core = useRef<THREE.ShaderMaterial>(null);
  const halo = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);
  const smooth = useRef({ level: 0, core: new THREE.Color(), rim: new THREE.Color() });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0.08 },
      uSpeed: { value: 0.25 },
      uGlow: { value: 0 },
      uCore: { value: new THREE.Color(PALETTE.idle[0]) },
      uRim: { value: new THREE.Color(PALETTE.idle[1]) },
    }),
    [],
  );

  useFrame((state, dt) => {
    const s = smooth.current;
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 8);
    s.level += (audioLevel.value - s.level) * k;

    const [c, r] = PALETTE[mode];
    uniforms.uCore.value.lerp(s.core.set(c), 1 - Math.exp(-dt * 4));
    uniforms.uRim.value.lerp(s.rim.set(r), 1 - Math.exp(-dt * 4));

    const breathing = 0.5 + 0.5 * Math.sin(t * 1.4);
    const target =
      mode === "thinking"
        ? { amp: 0.14, speed: 0.9, glow: 0.4 + 0.2 * breathing }
        : mode === "listening" || mode === "speaking"
          ? { amp: 0.08 + s.level * 0.38, speed: 0.45 + s.level * 0.8, glow: 0.25 + s.level }
          : { amp: 0.06 + breathing * 0.03, speed: 0.22, glow: breathing * 0.15 };

    uniforms.uTime.value += dt;
    uniforms.uAmp.value += (target.amp - uniforms.uAmp.value) * k;
    uniforms.uSpeed.value += (target.speed - uniforms.uSpeed.value) * k;
    uniforms.uGlow.value += (target.glow - uniforms.uGlow.value) * k;

    if (group.current) {
      group.current.rotation.y += dt * (mode === "thinking" ? 0.9 : 0.15);
      const scale = 1 + (mode === "idle" ? breathing * 0.025 : s.level * 0.08);
      group.current.scale.setScalar(scale);
      group.current.position.y = Math.sin(t * 0.9) * 0.04;
    }
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1, 64]} />
        <shaderMaterial
          ref={core}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
        />
      </mesh>
      <mesh scale={1.3}>
        <icosahedronGeometry args={[1, 32]} />
        <shaderMaterial
          ref={halo}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={haloFragment}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/**
 * Бөмбөлөг: товшвол ярина, чирвэл цонхыг дэлгэцийн хаана ч зөөнө.
 * 4 пикселээс их хөдөлсөн бол чирэлт, бага бол товшилт гэж үзнэ.
 */
export function Orb({
  mode,
  onClick,
  onDrag,
  onDragEnd,
}: {
  mode: Mode;
  onClick: () => void;
  onDrag?: (dx: number, dy: number, phase: "start" | "move") => void;
  onDragEnd?: () => void;
}) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  return (
    <button
      className={`orb orb--${mode}`}
      aria-label="Ярих (Ctrl+Shift+Space). Чирж зөөнө."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.screenX, y: e.screenY, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.screenX - d.x;
        const dy = e.screenY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        if (!d.moved) onDrag?.(0, 0, "start");
        d.moved = true;
        onDrag?.(dx, dy, "move");
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (d.moved) onDragEnd?.();
        else onClick();
      }}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <Blob mode={mode} />
      </Canvas>
    </button>
  );
}
