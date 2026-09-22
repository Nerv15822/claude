#!/usr/bin/env python3
"""
Genera un video MP4 in loop perfetto da usare come sfondo Live Photo per iPhone.

- 1290x2796, 60 fps, 3 s, H.264 (yuv420p, High profile) compatibile iOS
- ~1500 particelle ciano/bianche con glow morbido (additive blending + blur)
- movimento guidato da un campo di flusso curl-noise (Perlin 3D periodico nel tempo)
- le particelle si addensano lentamente verso il centro e poi si disperdono
- zona dell'orologio (25% superiore) volutamente meno densa
- loop perfetto: il noise e' ciclico nel tempo e la traiettoria viene chiusa con
  un cross-fade C1 (posizione e velocita' coincidono tra ultimo e primo frame)

Uso:
    python3 particles_wallpaper.py
    python3 particles_wallpaper.py --particles 2000 --seed 7 --crf 14
"""

import argparse
import importlib
import os
import shutil
import subprocess
import sys


# --------------------------------------------------------------------------- #
# Dipendenze
# --------------------------------------------------------------------------- #

def pip_install(*packages):
    print(f"[setup] installo {' '.join(packages)} ...", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", *packages])
    importlib.invalidate_caches()


def ensure_numpy():
    try:
        import numpy  # noqa: F401
    except ImportError:
        pip_install("numpy")


def find_ffmpeg():
    """Usa ffmpeg di sistema; se manca prova i package manager, poi imageio-ffmpeg."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe

    installers = []
    if sys.platform == "darwin" and shutil.which("brew"):
        installers.append(["brew", "install", "ffmpeg"])
    elif sys.platform.startswith("linux") and shutil.which("apt-get"):
        sudo = [] if os.geteuid() == 0 else (["sudo"] if shutil.which("sudo") else None)
        if sudo is not None:
            installers.append(sudo + ["apt-get", "install", "-y", "-qq", "ffmpeg"])
    for cmd in installers:
        print(f"[setup] ffmpeg non trovato, provo: {' '.join(cmd)}", flush=True)
        if subprocess.call(cmd) == 0 and shutil.which("ffmpeg"):
            return shutil.which("ffmpeg")

    # Fallback portabile: binario statico distribuito via pip
    try:
        import imageio_ffmpeg
    except ImportError:
        pip_install("imageio-ffmpeg")
        import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


ensure_numpy()
import numpy as np  # noqa: E402


# --------------------------------------------------------------------------- #
# Parametri
# --------------------------------------------------------------------------- #

W, H = 1290, 2796
GLOW_DS = 6                       # fattore di downsample del layer glow (1290/6, 2796/6 interi)
CLOCK_ZONE = 0.25                 # frazione superiore riservata all'orologio
CENTER = np.array([0.5 * W, 0.60 * H], dtype=np.float64)  # punto di addensamento

CYAN = np.array([0.20, 0.85, 1.00], dtype=np.float32)
WHITE = np.array([0.92, 0.97, 1.00], dtype=np.float32)
BG_TOP = np.array([0.000, 0.000, 0.006], dtype=np.float32)
BG_BOTTOM = np.array([0.008, 0.028, 0.090], dtype=np.float32)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# --------------------------------------------------------------------------- #
# Noise di Perlin 3D, periodico sull'asse del tempo
# --------------------------------------------------------------------------- #

class PeriodicPerlin3D:
    """Gradient noise 3D; l'asse z (tempo) si ripete ogni `period_z` celle."""

    _GRADS = np.array([
        [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
        [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
        [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ], dtype=np.float64)

    def __init__(self, rng, period_z):
        self.period_z = int(period_z)
        p = rng.permutation(256)
        self.perm = np.concatenate([p, p]).astype(np.int64)

    def _grad(self, ix, iy, iz, fx, fy, fz):
        perm = self.perm
        h = perm[(perm[(perm[ix & 255] + iy) & 255] + iz) & 255] % 12
        g = self._GRADS[h]
        return g[..., 0] * fx + g[..., 1] * fy + g[..., 2] * fz

    @staticmethod
    def _fade(t):
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)

    def __call__(self, x, y, z):
        x0, y0, z0 = np.floor(x), np.floor(y), np.floor(z)
        fx, fy, fz = x - x0, y - y0, z - z0
        ix = x0.astype(np.int64)
        iy = y0.astype(np.int64)
        iz = z0.astype(np.int64)
        iz0 = np.mod(iz, self.period_z)
        iz1 = np.mod(iz + 1, self.period_z)
        u, v, w = self._fade(fx), self._fade(fy), self._fade(fz)

        def lerp(a, b, t):
            return a + t * (b - a)

        n000 = self._grad(ix, iy, iz0, fx, fy, fz)
        n100 = self._grad(ix + 1, iy, iz0, fx - 1, fy, fz)
        n010 = self._grad(ix, iy + 1, iz0, fx, fy - 1, fz)
        n110 = self._grad(ix + 1, iy + 1, iz0, fx - 1, fy - 1, fz)
        n001 = self._grad(ix, iy, iz1, fx, fy, fz - 1)
        n101 = self._grad(ix + 1, iy, iz1, fx - 1, fy, fz - 1)
        n011 = self._grad(ix, iy + 1, iz1, fx, fy - 1, fz - 1)
        n111 = self._grad(ix + 1, iy + 1, iz1, fx - 1, fy - 1, fz - 1)

        nx00 = lerp(n000, n100, u)
        nx10 = lerp(n010, n110, u)
        nx01 = lerp(n001, n101, u)
        nx11 = lerp(n011, n111, u)
        return lerp(lerp(nx00, nx10, v), lerp(nx01, nx11, v), w)


# --------------------------------------------------------------------------- #
# Simulazione
# --------------------------------------------------------------------------- #

class FlowField:
    """Campo di velocita' a divergenza nulla (curl noise), periodico nel tempo."""

    def __init__(self, rng, duration):
        self.duration = duration
        # due ottave; il tempo percorre `period` celle per ciclo -> ciclico
        self.octaves = [
            (PeriodicPerlin3D(rng, 2), 1.0 / 620.0, 2, 1.00),
            (PeriodicPerlin3D(rng, 3), 1.0 / 260.0, 3, 0.45),
        ]
        self.eps = 1.5  # px, per le differenze finite

    def potential(self, x, y, t):
        phase = (t / self.duration) % 1.0
        acc = 0.0
        for noise, scale, period, amp in self.octaves:
            acc = acc + amp * noise(x * scale, y * scale + 17.3 * period, phase * period)
        return acc

    def velocity(self, pos, t):
        x, y = pos[:, 0], pos[:, 1]
        e = self.eps
        dpdx = (self.potential(x + e, y, t) - self.potential(x - e, y, t)) / (2 * e)
        dpdy = (self.potential(x, y + e, t) - self.potential(x, y - e, t)) / (2 * e)
        # curl 2D: v = (dpsi/dy, -dpsi/dx), normalizzato in px/s
        return np.stack([dpdy, -dpdx], axis=1) * 620.0 * 70.0


def sample_initial_positions(rng, n):
    """Distribuzione uniforme con densita' ridotta nella zona dell'orologio."""
    margin = 60.0
    pts = []
    while sum(len(p) for p in pts) < n:
        cand = np.column_stack([
            rng.uniform(-margin, W + margin, n),
            rng.uniform(-margin, H + margin, n),
        ])
        keep_prob = 0.18 + 0.82 * smoothstep(0.15 * H, 0.33 * H, cand[:, 1])
        pts.append(cand[rng.random(n) < keep_prob])
    return np.concatenate(pts)[:n]


def simulate(rng, n, fps, duration, substeps=2):
    """
    Integra le particelle da t=-T a t=+T e restituisce le posizioni ai frame
    t = k/fps, k = -F..F (2F+1 campioni). La chiusura del loop avviene dopo.
    """
    field = FlowField(rng, duration)
    frames = int(round(duration * fps))
    pos = sample_initial_positions(rng, n)
    pull = rng.uniform(0.65, 1.25, n)[:, None]    # sensibilita' individuale al centro
    speed = rng.uniform(0.7, 1.3, n)[:, None]

    # Attrazione periodica a media nulla: prima meta' ciclo contrae, seconda espande.
    # al culmine della contrazione il raggio medio si riduce a circa la meta'.
    attract_amp = 0.60

    dt = 1.0 / (fps * substeps)
    out = np.empty((2 * frames + 1, n, 2), dtype=np.float64)
    out[0] = pos
    t = -duration
    for k in range(1, 2 * frames + 1):
        for _ in range(substeps):
            # RK2 (midpoint)
            def vel(p, tt):
                v = field.velocity(p, tt) * speed
                a = attract_amp * np.sin(2 * np.pi * tt / duration)
                d = CENTER - p
                r = np.sqrt((d * d).sum(axis=1, keepdims=True))
                # non lineare: piu' forte vicino al centro -> ammasso arrotondato, non "scalato"
                v += a * pull * d * (700.0 / (r + 350.0))
                # lieve spinta fuori dalla zona dell'orologio
                clock = 1.0 - smoothstep(0.10 * H, 0.30 * H, p[:, 1])
                v[:, 1] += 55.0 * clock
                # pareti morbide: riporta dentro chi esce dallo schermo
                m = 40.0
                v[:, 0] += 4.0 * (np.maximum(-m - p[:, 0], 0) - np.maximum(p[:, 0] - W - m, 0))
                v[:, 1] += 4.0 * (np.maximum(-m - p[:, 1], 0) - np.maximum(p[:, 1] - H - m, 0))
                return v

            k1 = vel(pos, t)
            k2 = vel(pos + 0.5 * dt * k1, t + 0.5 * dt)
            pos = pos + dt * k2
            t += dt
        out[k] = pos
    return out


def close_loop(traj, frames):
    """
    Cross-fade tra la traiettoria in [0,T) e quella in [-T,0):
        f(t) = (1-w) q(t) + w q(t-T),  w = smoothstep(t/T)
    f(T) = q(0) = f(0) e, poiche' w'(0)=w'(T)=0, anche la velocita' coincide.
    """
    out = np.empty((frames,) + traj.shape[1:], dtype=np.float64)
    for i in range(frames):
        s = i / frames
        w = s * s * (3 - 2 * s)
        out[i] = (1 - w) * traj[frames + i] + w * traj[i]
    return out


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

class Renderer:
    def __init__(self, rng, n, seed):
        self.n = n
        self.seed = seed
        self.is_cyan = rng.random(n) < 0.62
        # dimensioni: molte piccole, poche grandi (distribuzione a coda)
        self.sigma = 0.55 + 2.1 * rng.random(n) ** 3.0
        self.base = rng.uniform(0.35, 1.0, n) * (0.8 + 0.35 * (self.sigma / 2.65))
        self.tw_freq = rng.integers(1, 4, n)          # cicli interi per loop -> periodico
        self.tw_phase = rng.uniform(0, 2 * np.pi, n)
        self.tw_depth = rng.uniform(0.15, 0.55, n)

        self.K = 7  # raggio sprite core (px)
        o = np.arange(-self.K, self.K + 1)
        self.ox, self.oy = np.meshgrid(o, o)
        self.ox = self.ox.ravel()[None, :]
        self.oy = self.oy.ravel()[None, :]

        yy = (np.arange(H, dtype=np.float32) + 0.5) / H
        grad = yy ** 1.6
        self.bg = (BG_TOP[None, :] * (1 - grad[:, None]) + BG_BOTTOM[None, :] * grad[:, None])[:, None, :]
        self.bg = np.broadcast_to(self.bg, (H, W, 3)).astype(np.float32)

        self.gw, self.gh = W // GLOW_DS, H // GLOW_DS
        self._init_glow_kernel()
        self._init_upsampler()

    # ---- glow: blur gaussiano (somma di due raggi) via FFT ------------------
    def _init_glow_kernel(self):
        pad = 48
        self.fft_shape = (self.gh + 2 * pad, self.gw + 2 * pad)
        self.pad = pad
        fy = np.fft.fftfreq(self.fft_shape[0])[:, None]
        fx = np.fft.rfftfreq(self.fft_shape[1])[None, :]
        f2 = fx * fx + fy * fy

        def g(sigma):  # trasformata di una gaussiana normalizzata
            return np.exp(-2 * (np.pi ** 2) * sigma * sigma * f2)

        self.glow_kernel = (0.55 * g(1.4) + 0.45 * g(4.5)).astype(np.complex64)

    def _blur(self, img):
        p = self.pad
        buf = np.zeros(self.fft_shape, dtype=np.float32)
        buf[p:p + self.gh, p:p + self.gw] = img
        res = np.fft.irfft2(np.fft.rfft2(buf) * self.glow_kernel, s=self.fft_shape)
        return res[p:p + self.gh, p:p + self.gw].astype(np.float32)

    # ---- upsample bilineare separabile --------------------------------------
    def _init_upsampler(self):
        def axis(n_out, n_in):
            src = (np.arange(n_out) + 0.5) / GLOW_DS - 0.5
            src = np.clip(src, 0, n_in - 1)
            i0 = np.floor(src).astype(np.int64)
            i1 = np.minimum(i0 + 1, n_in - 1)
            f = (src - i0).astype(np.float32)
            return i0, i1, f

        self.ux = axis(W, self.gw)
        self.uy = axis(H, self.gh)

    def _upsample(self, img):
        i0, i1, f = self.ux
        tmp = img[:, i0] * (1 - f) + img[:, i1] * f
        j0, j1, g = self.uy
        return tmp[j0] * (1 - g)[:, None] + tmp[j1] * g[:, None]

    # ---- splat ---------------------------------------------------------------
    def _splat_core(self, pos, amp):
        px = np.floor(pos[:, 0]).astype(np.int64)
        py = np.floor(pos[:, 1]).astype(np.int64)
        fx = (pos[:, 0] - px - 0.5)[:, None]
        fy = (pos[:, 1] - py - 0.5)[:, None]
        s = self.sigma[:, None]
        d2 = (self.ox - fx) ** 2 + (self.oy - fy) ** 2
        val = amp[:, None] * np.exp(-d2 / (2 * s * s))
        X = px[:, None] + self.ox
        Y = py[:, None] + self.oy
        ok = (X >= 0) & (X < W) & (Y >= 0) & (Y < H) & (val > 1e-4)
        idx = (Y * W + X)[ok]
        val = val[ok]
        cyan = np.broadcast_to(self.is_cyan[:, None], ok.shape)[ok]
        bc = np.bincount(idx[cyan], weights=val[cyan], minlength=W * H)
        bw = np.bincount(idx[~cyan], weights=val[~cyan], minlength=W * H)
        return bc.reshape(H, W).astype(np.float32), bw.reshape(H, W).astype(np.float32)

    def _splat_glow(self, pos, amp):
        gx = pos[:, 0] / GLOW_DS - 0.5
        gy = pos[:, 1] / GLOW_DS - 0.5
        x0 = np.floor(gx).astype(np.int64)
        y0 = np.floor(gy).astype(np.int64)
        fx, fy = gx - x0, gy - y0
        bufs = []
        for mask in (self.is_cyan, ~self.is_cyan):
            acc = np.zeros(self.gw * self.gh, dtype=np.float64)
            for dx, dy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)),
                              (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
                X, Y = x0 + dx, y0 + dy
                ok = mask & (X >= 0) & (X < self.gw) & (Y >= 0) & (Y < self.gh)
                acc += np.bincount(Y[ok] * self.gw + X[ok], weights=(amp * w)[ok],
                                   minlength=self.gw * self.gh)
            bufs.append(acc.reshape(self.gh, self.gw).astype(np.float32))
        return bufs

    def render(self, pos, frame_idx, frames):
        phase = 2 * np.pi * frame_idx / frames
        twinkle = 1.0 - self.tw_depth * (0.5 + 0.5 * np.sin(self.tw_freq * phase + self.tw_phase))
        # attenuazione nella zona dell'orologio
        zone = 0.30 + 0.70 * smoothstep(0.12 * H, (CLOCK_ZONE + 0.07) * H, pos[:, 1])
        amp = self.base * twinkle * zone

        core_c, core_w = self._splat_core(pos, amp * 1.6)
        glow_amp = amp * (0.6 + self.sigma ** 2) * 1.1
        glow_c, glow_w = self._splat_glow(pos, glow_amp)
        glow_c = self._upsample(self._blur(glow_c))
        glow_w = self._upsample(self._blur(glow_w))

        light = (core_c + 0.9 * glow_c)[..., None] * CYAN + (core_w + 0.9 * glow_w)[..., None] * WHITE
        # additive blending con tone-mapping morbido (niente clipping duro)
        mapped = 1.0 - np.exp(-light * 1.4)
        img = self.bg + (1.0 - self.bg) * mapped

        # dithering leggero contro il banding del gradiente
        drng = np.random.default_rng(self.seed * 100003 + frame_idx)
        img += (drng.random((H, W, 1), dtype=np.float32) - 0.5) * (1.5 / 255.0)
        return (np.clip(img, 0, 1) * 255.0 + 0.5).astype(np.uint8)


# --------------------------------------------------------------------------- #
# Encoding
# --------------------------------------------------------------------------- #

def open_encoder(ffmpeg, path, fps, crf):
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
        "-profile:v", "high", "-level:v", "5.1", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-g", str(fps), "-tag:v", "avc1", "-movflags", "+faststart",
        "-an", path,
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def write_png(ffmpeg, path, frame):
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-i", "-", "-frames:v", "1", path]
    subprocess.run(cmd, input=frame.tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--output", default="particles_wallpaper.mp4")
    ap.add_argument("--preview", default="particles_wallpaper_preview.png")
    ap.add_argument("--particles", type=int, default=1500)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--duration", type=float, default=3.0)
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--seed", type=int, default=2024)
    args = ap.parse_args()

    ffmpeg = find_ffmpeg()
    rng = np.random.default_rng(args.seed)
    frames = int(round(args.duration * args.fps))

    print(f"[sim] {args.particles} particelle, {frames} frame @ {args.fps} fps", flush=True)
    traj = simulate(rng, args.particles, args.fps, args.duration)
    positions = close_loop(traj, frames)

    renderer = Renderer(rng, args.particles, args.seed)
    preview_idx = frames // 2   # iOS usa il frame centrale come foto chiave

    enc = open_encoder(ffmpeg, args.output, args.fps, args.crf)
    try:
        for i in range(frames):
            frame = renderer.render(positions[i], i, frames)
            enc.stdin.write(frame.tobytes())
            if i == preview_idx:
                write_png(ffmpeg, args.preview, frame)
            if i % 20 == 0 or i == frames - 1:
                print(f"[render] frame {i + 1}/{frames}", flush=True)
    finally:
        enc.stdin.close()
        rc = enc.wait()
    if rc != 0:
        sys.exit(f"ffmpeg ha restituito codice {rc}")
    print(f"[ok] video:    {os.path.abspath(args.output)}")
    print(f"[ok] anteprima: {os.path.abspath(args.preview)}")


if __name__ == "__main__":
    main()
