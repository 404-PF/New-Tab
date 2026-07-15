#!/usr/bin/env python3
"""Generate seamless ambient soundscape loops bundled with the extension.

Each sound is synthesized procedurally as filtered noise (no external assets),
crossfaded at the loop boundary so it repeats without an audible click, then
encoded to a compact Opus (.ogg) file with ffmpeg.
"""
import math
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100          # sample rate
DUR = 8             # loop length in seconds
N = SR * DUR
T = np.arange(N) / SR
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "sounds"))


def white():
    return np.random.randn(N).astype(np.float32)


def pink():
    # Paul Kellet's economical pink-noise approximation.
    b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0
    out = np.empty(N, dtype=np.float32)
    w = white()
    for i in range(N):
        x = w[i]
        b0 = 0.99886 * b0 + x * 0.0555179
        b1 = 0.99332 * b1 + x * 0.0750759
        b2 = 0.96900 * b2 + x * 0.1538520
        b3 = 0.86650 * b3 + x * 0.3104856
        b4 = 0.55000 * b4 + x * 0.5329522
        b5 = -0.7616 * b5 - x * 0.0168980
        out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11
        b6 = x * 0.115926
    return out


def brown():
    w = white()
    out = np.cumsum(w)
    out = out - np.mean(out)
    peak = np.max(np.abs(out)) or 1.0
    return (out / peak).astype(np.float32)


def lpf(x, fc):
    dt = 1.0 / SR
    rc = 1.0 / (2 * math.pi * fc)
    a = dt / (rc + dt)
    y = np.zeros_like(x)
    prev = 0.0
    for i in range(N):
        prev = prev + a * (x[i] - prev)
        y[i] = prev
    return y.astype(np.float32)


def hpf(x, fc):
    dt = 1.0 / SR
    rc = 1.0 / (2 * math.pi * fc)
    a = rc / (rc + dt)
    y = np.zeros_like(x)
    prev_x = 0.0
    prev_y = 0.0
    for i in range(N):
        prev_y = a * (prev_x - x[i] + prev_y)
        y[i] = prev_y
        prev_x = x[i]
    return y.astype(np.float32)


def bandpass(x, lo, hi):
    return lpf(hpf(x, lo), hi)


def normalize(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return (x / m * peak).astype(np.float32)


def make_seamless(x):
    """Crossfade the tail onto the head so the buffer loops without a click.

    After this, the first sample equals the last, giving sample-continuous
    looping when played with the `loop` attribute.
    """
    cf = int(SR * 1.5)  # 1.5s crossfade
    if cf * 2 > N:
        return x
    fade = np.linspace(0.0, 1.0, cf, dtype=np.float32)
    out = x.copy()
    head = x[:cf]
    tail = x[-cf:]
    crossfade = (head * fade + tail * (1.0 - fade)).astype(np.float32)
    out[:cf] = crossfade
    out[-cf:] = crossfade
    out[-1] = out[0]
    return out


def chirp(t0, t1, f0, f1, amp):
    """A short frequency-swept sine 'bird' chirp."""
    mask = (T >= t0) & (T <= t1)
    seg = T[mask] - t0
    dur = t1 - t0
    env = np.sin(np.pi * seg / dur)  # smooth in/out envelope
    sig = np.sin(2 * np.pi * (f0 + (f1 - f0) * seg / dur) * seg)
    out = np.zeros(N, dtype=np.float32)
    out[mask] = (sig * env * amp).astype(np.float32)
    return out


def synth_rain():
    base = hpf(white(), 1500) * 0.55
    body = lpf(white(), 700) * 0.12
    return normalize(make_seamless(base + body))


def synth_ocean():
    wave = 0.5 + 0.5 * np.sin(2 * np.pi * (1.0 / DUR) * T)
    wave = wave ** 1.5
    surf = lpf(brown(), 550) * 0.8
    hiss = hpf(white(), 2500) * 0.06 * wave
    return normalize(make_seamless((surf + hiss) * wave))


def synth_wind():
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * (2.0 / DUR) * T + 0.7)
    air = bandpass(pink(), 300, 1100)
    gust = lpf(white(), 200) * 0.15
    return normalize(make_seamless((air + gust) * mod))


def synth_forest():
    amb = lpf(pink(), 2200) * 0.18
    amb = amb * (0.7 + 0.3 * np.sin(2 * np.pi * (1.0 / DUR) * T))
    out = amb.copy()
    # A handful of bird chirps placed safely inside the loop interior.
    rng = np.random.default_rng(7)
    for _ in range(5):
        t0 = float(rng.uniform(1.0, DUR - 2.0))
        out = out + chirp(t0, t0 + 0.18, 2200, 3400, 0.12)
        out = out + chirp(t0 + 0.22, t0 + 0.34, 3000, 1800, 0.09)
    return normalize(make_seamless(out))


def synth_cafe():
    murmur = lpf(brown(), 650) * 0.7
    chatter = bandpass(pink(), 500, 2200) * 0.18
    chatter = chatter * (0.6 + 0.4 * np.sin(2 * np.pi * (2.0 / DUR) * T))
    clink = bandpass(white(), 3000, 6000) * 0.03
    return normalize(make_seamless(murmur + chatter + clink))


def synth_fire():
    bed = lpf(brown(), 220) * 0.5
    out = bed.copy()
    rng = np.random.default_rng(11)
    for _ in range(40):
        t0 = float(rng.uniform(0.2, DUR - 0.5))
        dur = float(rng.uniform(0.02, 0.12))
        t1 = min(t0 + dur, DUR - 0.01)
        mask = (T >= t0) & (T <= t1)
        seg = T[mask] - t0
        env = np.exp(-seg * 60.0)
        crackle = (np.random.randn(mask.sum()) * env).astype(np.float32)
        tmp = np.zeros(N, dtype=np.float32)
        tmp[mask] = crackle
        out = out + tmp * 0.5
    return normalize(make_seamless(out))


def synth_white_noise():
    return normalize(make_seamless(white() * 0.25))


def synth_pink_noise():
    return normalize(make_seamless(pink() * 0.5))


SOUNDS = {
    "rain": synth_rain,
    "ocean": synth_ocean,
    "wind": synth_wind,
    "forest": synth_forest,
    "cafe": synth_cafe,
    "fire": synth_fire,
    "whiteNoise": synth_white_noise,
    "pinkNoise": synth_pink_noise,
}


def write_wav(path, samples):
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        pcm = np.clip(samples, -1.0, 1.0)
        wf.writeframes((pcm * 32767.0).astype("<i2").tobytes())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp_dir:
        for name, fn in SOUNDS.items():
            samples = fn()
            wav_path = os.path.join(temp_dir, name + ".wav")
            ogg_path = os.path.join(OUT_DIR, name + ".ogg")
            write_wav(wav_path, samples)
            # Opus at a low bitrate keeps each loop well under 200 KB.
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", wav_path,
                "-c:a", "libopus", "-b:a", "48k", "-application", "audio",
                ogg_path,
            ], check=True)
            size_kb = os.path.getsize(ogg_path) / 1024.0
            print(f"{name:>10}: {size_kb:6.1f} KB")


if __name__ == "__main__":
    main()
