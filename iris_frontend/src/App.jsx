import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';

// `max` is the accepted upper bound (a bit above the real Iris-dataset range).
// Values must be >= 0 and <= max to be valid.
const FIELDS = [
  { key: 'sepal_length', label: 'Sepal length', hint: 'the outer, leaf-like part', max: 10 },
  { key: 'sepal_width',  label: 'Sepal width',  hint: 'across the outer part',    max: 6 },
  { key: 'petal_length', label: 'Petal length', hint: 'the inner, colored part',  max: 9 },
  { key: 'petal_width',  label: 'Petal width',  hint: 'across the inner part',     max: 4 },
];

const SPECIES_META = {
  'Iris setosa':     { tint: '#7C9A6B', note: 'small petals, broad sepals' },
  'Iris versicolor': { tint: '#5B7FA6', note: 'the mid-sized wildflower' },
  'Iris virginica':  { tint: '#7A5BA6', note: 'the largest of the three' },
};

const API_URL = import.meta.env.DEV ? 'http://localhost:8000' : 'https://ann-iris-project.onrender.com';

// Validate one raw field value against its field's bounds.
// Returns { valid, empty, message }.
function validateField(field, raw) {
  if (raw === '' || raw == null) return { valid: false, empty: true, message: '' };
  const n = parseFloat(raw);
  if (isNaN(n)) return { valid: false, empty: false, message: 'Enter a number' };
  if (n < 0) return { valid: false, empty: false, message: 'Must be 0 or more' };
  if (n > field.max) return { valid: false, empty: false, message: `Too large for an iris (max ${field.max})` };
  return { valid: true, empty: false, message: '' };
}

/* Three.js ambient scene: drifting petals + pollen motes, plus a
   burst() the UI fires on prediction. Uses only core r128 geometries. */
function useThreeScene(containerRef) {
  const api = useRef({ burst: () => {}, setTint: () => {} });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x26301f, 0.035);

    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xf3efe2, 1.1);
    key.position.set(4, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0xcbd7b4, 1.2, 40);
    rim.position.set(-6, -3, 6);
    scene.add(rim);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(1.1, 0.4, 1.0, 2.2, 0, 2.8);
    shape.bezierCurveTo(-1.0, 2.2, -1.1, 0.4, 0, 0);
    const petalGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    petalGeo.translate(0, -1.2, 0);

    let tint = new THREE.Color(0x7c9a6b);

    const petals = [];
    const PETAL_COUNT = 22;
    for (let i = 0; i < PETAL_COUNT; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? 0xcbd7b4 : tint.clone(),
        roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85,
      });
      const m = new THREE.Mesh(petalGeo, mat);
      m.scale.setScalar(0.5 + Math.random() * 0.7);
      m.position.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 14 - 4);
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      m.userData = {
        spin: new THREE.Vector3((Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006),
        drift: 0.004 + Math.random() * 0.006,
        sway: Math.random() * Math.PI * 2,
        isAccent: i % 3 === 0, baseMat: mat,
      };
      scene.add(m);
      petals.push(m);
    }

    const MOTES = 260;
    const pos = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const moteMat = new THREE.PointsMaterial({ color: 0xe9e4c8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const motes = new THREE.Points(moteGeo, moteMat);
    scene.add(motes);

    const burst = { active: 0, group: new THREE.Group() };
    scene.add(burst.group);
    const BURST_N = 40;
    const burstMeshes = [];
    for (let i = 0; i < BURST_N; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: tint.clone(), roughness: 0.6, transparent: true, side: THREE.DoubleSide });
      const m = new THREE.Mesh(petalGeo, mat);
      m.visible = false;
      const a = (i / BURST_N) * Math.PI * 2;
      m.userData = { dir: new THREE.Vector3(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 1.5), mat };
      burst.group.add(m);
      burstMeshes.push(m);
    }

    api.current.burst = () => { burst.active = 1; };
    api.current.setTint = (hex) => {
      tint = new THREE.Color(hex);
      petals.forEach(p => { if (!p.userData.isAccent) p.userData.baseMat.color.copy(tint); });
      burstMeshes.forEach(m => m.userData.mat.color.copy(tint));
      rim.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.3);
    };

    let mx = 0, my = 0;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    el.addEventListener('pointermove', onMove);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, t = 0;
    const clock = new THREE.Clock();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      t += dt;

      camera.position.x += (mx * 2 - camera.position.x) * 0.04;
      camera.position.y += (-my * 1.4 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);

      if (!reduce) {
        petals.forEach(p => {
          p.rotation.x += p.userData.spin.x;
          p.rotation.y += p.userData.spin.y;
          p.rotation.z += p.userData.spin.z;
          p.position.y -= p.userData.drift;
          p.position.x += Math.sin(t + p.userData.sway) * 0.004;
          if (p.position.y < -11) { p.position.y = 11; p.position.x = (Math.random() - 0.5) * 26; }
        });
        motes.rotation.y += 0.0008;
        motes.rotation.x += 0.0003;
      }

      if (burst.active > 0) {
        burst.active += dt * 1.1;
        const p = burst.active - 1;
        burstMeshes.forEach(m => {
          m.visible = p < 1;
          m.position.copy(m.userData.dir).multiplyScalar(p * 9);
          m.scale.setScalar(0.6 * (1 - p * 0.6));
          m.rotation.z += 0.1;
          m.userData.mat.opacity = Math.max(0, 1 - p);
        });
        if (p >= 1) { burst.active = 0; burstMeshes.forEach(m => (m.visible = false)); }
      }

      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      if (!el.clientWidth) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointermove', onMove);
      petalGeo.dispose(); moteGeo.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [containerRef]);

  return api;
}

export default function App() {
  const [form, setForm] = useState({ sepal_length: '', sepal_width: '', petal_length: '', petal_width: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(false);
  const [awake, setAwake] = useState(false);

  const bgRef = useRef(null);
  const three = useThreeScene(bgRef);

  // Validate every field once per render.
  const validity = FIELDS.map(f => ({ field: f, ...validateField(f, form[f.key]) }));
  const allValid = validity.every(v => v.valid);
  const values = FIELDS.map(f => {
    const n = parseFloat(form[f.key]);
    return isNaN(n) ? 0 : n;
  });

  const handleSubmit = async () => {
    if (!allValid) return;
    setError(null); setLoading(true); setResult(null);
    const payload = {
      sepal_length: values[0], sepal_width: values[1],
      petal_length: values[2], petal_width: values[3],
    };
    await new Promise(r => setTimeout(r, 650));
    try {
      const r = await fetch(`${API_URL}/predict`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('backend');
      const res = await r.json();
      setResult(res);
      setAwake(true);
      three.current.setTint(SPECIES_META[res.species]?.tint);
      three.current.burst();
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleWake = async () => {
    setWaking(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/health`);
      if (!r.ok) throw new Error('backend');
      setAwake(true);
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setWaking(false);
    }
  };

  const activeTint = result ? (SPECIES_META[result.species]?.tint ?? '#7C9A6B') : '#4B6043';
  const anyError = validity.some(v => !v.valid && !v.empty);

  return (
    <div style={{ fontFamily: "'Spectral', Georgia, serif", background: '#26301F' }}
         className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8 overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,600;1,400&family=Inter:wght@400;500;600&display=swap');
        input[type=number]::-webkit-inner-spin-button { opacity: 0.35; }
      `}</style>

      <div ref={bgRef} className="absolute inset-0 z-0" />

      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-3xl grid md:grid-cols-[1fr_1.1fr] overflow-hidden rounded-2xl"
        style={{ boxShadow: '0 30px 70px -20px rgba(10,15,5,0.7)' }}>
        <div className="relative p-7 sm:p-9 flex flex-col justify-between"
             style={{ background: 'linear-gradient(160deg, rgba(51,66,44,0.92) 0%, rgba(30,38,24,0.92) 100%)' }}>
          <div>
            <p className="tracking-[0.35em] text-[10px] uppercase" style={{ color: '#B9C4A6', fontFamily: 'Inter, sans-serif' }}>
              Herbarium · No. 150
            </p>
            <h1 className="mt-2 text-3xl leading-tight" style={{ color: '#F3EFE2' }}>
              Iris<br /><span style={{ fontStyle: 'italic', color: '#CBD7B4' }}>specimen key</span>
            </h1>
          </div>
          <IrisDrawing values={values} tint={activeTint} bloom={!!result} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#9FAE8A', fontFamily: 'Inter, sans-serif' }}>
            The drawing grows with your measurements — the scene behind blooms when a species is keyed.
          </p>
        </div>

        <div className="p-7 sm:p-9 flex flex-col" style={{ background: 'rgba(247,244,234,0.95)' }}>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-lg" style={{ color: '#3A4632' }}>Measurements</h2>
            <span className="text-[11px]" style={{ color: '#9A9482', fontFamily: 'Inter, sans-serif' }}>
              {validity.filter(v => v.valid).length}/4 valid
            </span>
          </div>

          <div className="space-y-4">
            {FIELDS.map((f, i) => (
              <Field key={f.key} field={f} index={i} value={form[f.key]}
                     state={validity[i]}
                     onChange={(val) => setForm({ ...form, [f.key]: val })} />
            ))}
          </div>

          <motion.button
            onClick={handleSubmit} disabled={loading || !allValid}
            whileHover={{ scale: !allValid ? 1 : 1.015 }} whileTap={{ scale: !allValid ? 1 : 0.985 }}
            className="mt-6 py-3 rounded-full text-sm tracking-wide disabled:cursor-not-allowed"
            style={{
              fontFamily: 'Inter, sans-serif', fontWeight: 600,
              background: !allValid ? '#D8D3C4' : '#3A4632',
              color: !allValid ? '#8A8574' : '#F3EFE2', transition: 'background 0.3s',
            }}>
            {loading ? 'Keying out…'
              : anyError ? 'Fix the highlighted values'
              : !allValid ? 'Enter all four measurements'
              : 'Identify species'}
          </motion.button>

          {!awake && (
            <div className="mt-3 flex items-center gap-2.5">
              <motion.button
                onClick={handleWake} disabled={waking}
                whileHover={{ scale: waking ? 1 : 1.02 }} whileTap={{ scale: waking ? 1 : 0.97 }}
                className="py-1.5 px-3.5 rounded-full text-xs disabled:cursor-not-allowed"
                style={{
                  fontFamily: 'Inter, sans-serif', fontWeight: 500,
                  background: 'transparent', border: '1px solid #C7C2B0',
                  color: '#6B6656',
                }}>
                {waking ? 'Waking…' : 'Wake up backend'}
              </motion.button>
              <p className="text-[11px] leading-snug" style={{ color: '#9A9482', fontFamily: 'Inter, sans-serif' }}>
                Backend runs on a free-tier service and may take up to a minute to spin up after inactivity.
              </p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="mt-4 text-sm" style={{ color: '#A5502F' }}>{error}</motion.p>
            )}
            {result && !loading && (
              <motion.div key="res" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 rounded-xl p-5"
                style={{ background: '#FFFFFF', border: '1px solid #E7E1D1', boxShadow: '0 12px 30px -18px rgba(60,70,50,0.4)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: '#A29B88', fontFamily: 'Inter, sans-serif' }}>Identified as</p>
                    <p className="text-2xl mt-1" style={{ fontStyle: 'italic', color: SPECIES_META[result.species]?.tint }}>{result.species}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8A8474', fontFamily: 'Inter, sans-serif' }}>{SPECIES_META[result.species]?.note}</p>
                  </div>
                  <ConfidenceRing value={result.confidence} tint={SPECIES_META[result.species]?.tint} />
                </div>
                <div className="mt-5 space-y-2.5">
                  {Object.entries(result.probabilities).sort((a, b) => b[1] - a[1]).map(([sp, prob], i) => (
                    <div key={sp}>
                      <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'Inter, sans-serif', color: '#5A5648' }}>
                        <span style={{ fontStyle: 'italic' }}>{sp}</span><span>{(prob * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#ECE7DA' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${prob * 100}%` }}
                          transition={{ delay: 0.15 + i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                          className="h-full rounded-full" style={{ background: SPECIES_META[sp]?.tint }} />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ field, index, value, state, onChange }) {
  const [focused, setFocused] = useState(false);
  const showError = !state.valid && !state.empty;
  const underline = showError ? '#A5502F' : '#4B6043';

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + index * 0.08, duration: 0.5 }}>
      <label className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm" style={{ color: '#3A4632' }}>{field.label}</span>
        <span className="text-[10px]" style={{ color: '#AAA394', fontFamily: 'Inter, sans-serif' }}>{field.hint}</span>
      </label>
      <div className="relative">
        <input type="number" step="0.1" min="0" max={field.max} required value={value}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(e) => {
            // Clamp: reject anything below zero outright; allow empty and any
            // in-range/over-range number through so the inline hint can show.
            const v = e.target.value;
            if (v === '' || parseFloat(v) >= 0) onChange(v);
          }}
          placeholder="0.0"
          className="w-full bg-transparent pb-1.5 text-lg outline-none"
          style={{ color: '#2C3524', fontFamily: 'Inter, sans-serif' }} />
        <span className="absolute right-0 bottom-2 text-xs" style={{ color: '#B4AD9C', fontFamily: 'Inter, sans-serif' }}>cm</span>
        <div className="h-px w-full" style={{ background: '#DAD3C2' }} />
        <motion.div className="h-[2px] absolute bottom-0 left-0"
          animate={{ width: focused || showError ? '100%' : '0%' }}
          transition={{ duration: 0.35, ease: 'easeOut' }} style={{ background: underline }} />
      </div>
      <AnimatePresence>
        {showError && (
          <motion.p
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="text-[11px] mt-1" style={{ color: '#A5502F', fontFamily: 'Inter, sans-serif' }}>
            {state.message}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function IrisDrawing({ values, tint, bloom }) {
  const [sl, sw, pl, pw] = values;
  const norm = (v, max) => Math.min(Math.max(v / max, 0), 1);
  const sepalR = 40 + norm(sl, 8) * 45;
  const sepalW = 0.55 + norm(sw, 4.5) * 0.9;
  const petalR = 12 + norm(pl, 7) * 55;
  const petalW = 0.35 + norm(pw, 2.6) * 0.7;

  const petal = (r, w, rot, fill, op) => {
    const wx = 26 * w;
    return (
      <motion.path
        d={`M0,0 C${wx},${-r * 0.45} ${wx},${-r * 0.85} 0,${-r} C${-wx},${-r * 0.85} ${-wx},${-r * 0.45} 0,0 Z`}
        transform={`rotate(${rot})`} fill={fill} fillOpacity={op}
        initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }} />
    );
  };

  return (
    <div className="flex items-center justify-center my-6">
      <svg viewBox="-110 -110 220 220" className="w-52 h-52">
        <motion.g animate={{ rotate: bloom ? 360 : 0 }} transition={{ duration: 1.4, ease: 'easeInOut' }}>
          {[0, 120, 240].map(rot => <g key={`s${rot}`}>{petal(sepalR, sepalW, rot, '#CBD7B4', 0.5)}</g>)}
          {[60, 180, 300].map(rot => <g key={`p${rot}`}>{petal(petalR, petalW, rot, tint, 0.85)}</g>)}
        </motion.g>
        <motion.circle r={7} fill="#F3EFE2" animate={{ r: bloom ? 9 : 7 }} transition={{ duration: 0.6 }} />
      </svg>
    </div>
  );
}

function ConfidenceRing({ value, tint }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#ECE7DA" strokeWidth="6" />
      <motion.circle cx="34" cy="34" r={r} fill="none" stroke={tint} strokeWidth="6" strokeLinecap="round"
        transform="rotate(-90 34 34)" strokeDasharray={c}
        initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value) }}
        transition={{ delay: 0.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      <text x="34" y="38" textAnchor="middle" fontSize="15" fontFamily="Inter, sans-serif" fontWeight="600" fill="#3A4632">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}