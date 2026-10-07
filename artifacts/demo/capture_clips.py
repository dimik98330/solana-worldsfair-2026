"""Encode the lead's real CUA frame captures at their recorded timing."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('names', nargs='+')
    args = parser.parse_args()
    out_dir = HERE / 'clips'
    out_dir.mkdir(exist_ok=True)
    for name in args.names:
        if not name.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Capture names must be simple directory names')
        recording = ROOT / 'docs/evidence/ui/recording' / name
        timing_path = recording / 'timestamps.json'
        timing = json.loads(timing_path.read_text(encoding='utf-8'))
        frames = sorted(recording.glob('frame-*.jpg'))
        times = timing['times']
        assert len(frames) == len(times) and len(frames) > 1
        assert all(b > a for a, b in zip(times, times[1:]))
        assert times[0] >= timing['started'] and timing['ended'] >= times[-1]
        duration = (timing['ended'] - timing['started']) / 1000
        # Capture timestamps are quantized to the final 30fps video. Keep the
        # original total duration and state order; no invented interaction.
        lines = ['ffconcat version 1.0\n']
        for index, frame in enumerate(frames):
            next_time = times[index+1] if index+1 < len(times) else timing['ended']
            hold = (next_time - times[index]) / 1000
            if index == 0:
                hold += (times[0] - timing['started']) / 1000
            lines += [f"file '{frame.as_posix()}'\n", f'duration {hold:.6f}\n']
        lines.append(f"file '{frames[-1].as_posix()}'\n")
        concat = out_dir / f'{name}.ffconcat'
        concat.write_text(''.join(lines), encoding='utf-8')
        out = out_dir / f'{name}.mp4'
        command = ['C:/ffmpeg/bin/ffmpeg.exe', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-vf', 'fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:color=white', '-t', str(duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', str(out)]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr[-4000:])
        provenance = {'kind': 'real_cua_capture', 'source': str(recording.relative_to(ROOT)).replace('\\', '/'), 'timestamp_sha256': sha(timing_path), 'started': timing['started'], 'ended': timing['ended'], 'capture_duration_seconds': duration, 'frames': [{'file': frame.name, 'sha256': sha(frame), 'timestamp': times[index]} for index, frame in enumerate(frames)], 'output': str(out.relative_to(ROOT)).replace('\\', '/'), 'output_sha256': sha(out), 'timing_note': 'Actual capture order and elapsed timing; quantized to 30fps; no synthesized cursor/actions.'}
        out.with_suffix('.provenance.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')
        print(f'Actual captured UI clip: {name}; {len(frames)} source frames; {duration:.3f}s', flush=True)


if __name__ == '__main__':
    main()
