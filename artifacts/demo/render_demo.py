"""Render verified captured UI with local narration; no synthetic app screens.

Requires the bundled Pillow runtime, the existing FFmpeg binary, and the
captured assets explicitly listed by the lead in scenes.json. All outputs stay
inside artifacts/demo. Input screenshots and integration evidence are read only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WIDTH, HEIGHT, FPS = 1920, 1080, 30
PANEL = (424, 198, 1416, 706)
BG = '#F7F7F8'
INK = '#161A22'
MUTED = '#596272'
COBALT = '#002FA7'
FONT_ROOT = Path('C:/Windows/Fonts')


def font(size: int, bold: bool = False):
    return ImageFont.truetype(str(FONT_ROOT / ('arialbd.ttf' if bold else 'arial.ttf')), size)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args: list[str]) -> None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])


def probe_media(path: Path, native_probe: str | None, wsl_probe: bool) -> dict:
    options = ['-v', 'error', '-show_streams', '-show_format', '-of', 'json']
    if wsl_probe:
        # The lead provisioned /usr/bin/ffprobe in Ubuntu. No install/config
        # action is performed here, and no WSL shell quoting is required.
        wsl_path = '/mnt/' + path.drive[0].lower() + str(path)[2:].replace('\\', '/')
        command = ['wsl.exe', '-d', 'Ubuntu', '--', '/usr/bin/ffprobe', *options, wsl_path]
    else:
        command = [native_probe or 'ffprobe', *options, str(path)]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def ass_time(seconds: float) -> str:
    centiseconds = round(seconds * 100)
    return f'{centiseconds // 360000}:{centiseconds // 6000 % 60:02}:{centiseconds // 100 % 60:02}.{centiseconds % 100:02}'


def srt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    return f'{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02},{milliseconds % 1000:03}'


def audio(scene: dict, out: Path) -> list[dict]:
    sample_rate = 22050
    samples = bytearray(round(0.65 * sample_rate) * 2)
    cues = []
    for index, text in enumerate(scene['cues']):
        source = HERE / 'audio' / f"{scene['id']}-{index:02}.wav"
        with wave.open(str(source), 'rb') as reader:
            if (reader.getnchannels(), reader.getsampwidth(), reader.getframerate()) != (1, 2, sample_rate):
                raise ValueError(f'Unexpected voice audio format: {source}')
            sound = reader.readframes(reader.getnframes())
        start = len(samples) / (2 * sample_rate)
        samples.extend(sound)
        end = len(samples) / (2 * sample_rate)
        cues.append({'start': start, 'end': end, 'text': text})
        samples.extend(bytes(round(0.16 * sample_rate) * 2))
    required = round(scene['duration'] * sample_rate) * 2
    if len(samples) > required - sample_rate:
        raise ValueError(f"Narration exceeds safe scene duration: {scene['id']} ({len(samples) / (2 * sample_rate):.2f}s)")
    samples.extend(bytes(required - len(samples)))
    with wave.open(str(out), 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate)
        writer.writeframes(samples)
    return cues


def draw_wrapped(draw, text, xy, width, size, bold=False, fill=INK, gap=12):
    face = font(size, bold)
    y = xy[1]
    for explicit in text.split('\n'):
        current = ''
        for word in explicit.split():
            attempt = f'{current} {word}'.strip()
            if draw.textlength(attempt, font=face) > width and current:
                draw.text((xy[0], y), current, font=face, fill=fill)
                y += size + gap
                current = word
            else:
                current = attempt
        draw.text((xy[0], y), current, font=face, fill=fill)
        y += size + gap
    return y


def evidence_panel(source: Path) -> Image.Image:
    report = json.loads(source.read_text(encoding='utf-8'))
    assert report['network'] == 'localnet'
    assert report['checkedAt'] == '2026-10-07T18:46:40.523Z'
    assert len(report['proofs']) == 11 and all(p['status'] == 'confirmed' for p in report['proofs'])
    assert all(report['checks'].values())
    panel = Image.new('RGB', PANEL[2:], '#FFFFFF')
    draw = ImageDraw.Draw(panel)
    mono = ImageFont.truetype(str(FONT_ROOT / 'consola.ttf'), 28)
    draw.text((42, 30), 'Saved integration evidence', font=font(44, True), fill=INK)
    draw.text((42, 93), '11 confirmed actions · localnet · test tokens', font=font(30, True), fill=COBALT)
    draw.text((42, 143), report['checkedAt'], font=font(28), fill=MUTED)
    draw.text((42, 183), 'Instrument: ' + report['instrument']['address'], font=mono, fill=MUTED)
    selected = [next(p for p in report['proofs'] if p['action'] == name and (name == 'capture_coupon' or p['role'] == 'investor1')) for name in ['capture_coupon', 'claim_coupon', 'redeem_principal']]
    for index, receipt in enumerate(selected):
        y = 244 + index * 142
        draw.line((42, y, PANEL[2]-42, y), fill='#DCE0E8', width=2)
        label = f"{receipt['action']}   /   confirmed   /   slot {receipt['slot']}"
        draw.text((42, y+15), label, font=font(30, True), fill=INK)
        signature = receipt['signature']
        for line in range(math.ceil(len(signature)/44)):
            draw.text((42, y+57+line*32), signature[line*44:(line+1)*44], font=mono, fill=MUTED)
    return panel


def artwork(scene: dict, stage: Path) -> tuple[Path, Path]:
    source = (ROOT / scene['image']).resolve()
    allowed = (ROOT / 'docs' / 'evidence' / 'ui').resolve()
    if scene.get('kind') == 'evidence':
        if source != (HERE / 'evidence/full-smoke-localnet-2026-10-07.json').resolve():
            raise ValueError('Evidence card must use the frozen inspected integration report')
        product = evidence_panel(source)
    else:
        verified_capture = source.is_relative_to(allowed)
        if source.is_relative_to((HERE / 'inputs').resolve()):
            frozen = json.loads((HERE / 'frozen-inputs.json').read_text(encoding='utf-8'))
            entry = next((item for item in frozen['inputs'] if (ROOT / item['path']).resolve() == source), None)
            verified_capture = bool(entry and entry['sha256'] == digest(source) and (ROOT / entry['origin']).resolve().is_relative_to(allowed))
        if not verified_capture or not source.is_file():
            raise ValueError(f'Captured input is missing or outside verified UI directory: {source}')
        with Image.open(source) as captured:
            captured = captured.convert('RGB')
            roi = scene.get('crop', [0, 0, 1, 1])
            bounds = tuple(round(roi[i] * (captured.width if i % 2 == 0 else captured.height)) for i in range(4))
            captured = captured.crop(bounds)
            # Preserve the original image's proportions; no stretching or screen editing.
            factor = min(PANEL[2] / captured.width, PANEL[3] / captured.height)
            captured = captured.resize((round(captured.width*factor), round(captured.height*factor)), Image.Resampling.LANCZOS)
            product = Image.new('RGB', PANEL[2:], '#FFFFFF')
            product.paste(captured, ((PANEL[2]-captured.width)//2, (PANEL[3]-captured.height)//2))
    panel_path = stage / f"{scene['id']}-product.png"
    product.save(panel_path)

    canvas = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(canvas)
    # A hairline grid and shallow tonal frame follow the existing Swiss brand.
    draw.line((64, 113, WIDTH-64, 113), fill='#DCE0E8', width=2)
    draw.text((64, 52), 'BondTrace', font=font(40, True), fill=INK)
    draw.text((1460, 59), 'LOCALNET · TEST TOKENS', font=font(28, True), fill=COBALT)
    draw_wrapped(draw, scene['eyebrow'], (64, 151), 318, 26, True, COBALT, gap=7)
    headline_end = draw_wrapped(draw, scene['title'], (64, 229), 318, 58, True, gap=10)
    rule_y = max(452, headline_end + 24)
    draw.line((64, rule_y, 352, rule_y), fill='#DCE0E8', width=2)
    fact_y = draw_wrapped(draw, scene['fact'], (64, rule_y + 28), 318, 39, True, gap=10)
    draw_wrapped(draw, scene['note'], (64, fact_y + 28), 318, 28, fill=MUTED, gap=9)

    x, y, w, h = PANEL
    draw.rounded_rectangle((x-5, 153, x+w+5, y+h+7), radius=10, fill='#E8EBF1')
    draw.rounded_rectangle((x-2, 150, x+w+2, y+h+3), radius=9, fill='#FFFFFF', outline='#DCE0E8', width=2)
    draw.rectangle((x, 153, x+w, y-2), fill='#F1F3F7')
    for dot in range(3):
        dx = x+19+dot*21
        draw.ellipse((dx, 168, dx+10, 178), fill='#9BA4B4')
    container_title = 'Saved evidence · separate fixture run' if scene.get('kind') == 'evidence' else 'Captured local prototype'
    draw.text((x+110, 157), container_title, font=font(26), fill=MUTED)
    draw.text((x+w-271, 157), scene['id'].upper(), font=font(26, True), fill=COBALT)
    draw.text((x, 927), scene['provenance'], font=font(28), fill=MUTED)
    if scene.get('cut'):
        draw.rectangle((64, 871, 354, 933), fill='#E7EDFC')
        draw.text((79, 881), 'Idle wait cut', font=font(28, True), fill=COBALT)
    draw.line((64, 969, WIDTH-64, 969), fill='#DCE0E8', width=2)
    bg_path = stage / f"{scene['id']}-background.png"
    canvas.save(bg_path)
    poster = canvas.copy()
    poster.paste(product, (x, y))
    poster.save(stage / f"{scene['id']}-preview.png")
    return bg_path, panel_path


def subtitles(scene: dict, cues: list[dict], stage: Path) -> Path:
    ass = stage / f"{scene['id']}.ass"
    header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,36,&H00221A16,&H00221A16,&H00F8F7F7,&H00F8F7F7,0,0,0,0,100,100,0,0,1,0.6,0,2,64,64,42,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    lines = [header]
    for cue in cues:
        text = cue['text'].replace('{', '').replace('}', '').replace('\n', '\\N')
        lines.append(f"Dialogue: 0,{ass_time(cue['start'])},{ass_time(cue['end'])},Default,,0,0,0,,{text}\n")
    ass.write_text(''.join(lines), encoding='utf-8')
    return ass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', default='C:/ffmpeg/bin/ffmpeg.exe')
    parser.add_argument('--ffprobe', default=None)
    parser.add_argument('--ffprobe-wsl', action='store_true')
    parser.add_argument('--manifest', type=Path, default=HERE / 'scenes.json')
    parser.add_argument('--output', type=Path, default=HERE / 'bondtrace-product-demo.mp4')
    parser.add_argument('--art-only', action='store_true')
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest_digest = digest(manifest_path)
    total = sum(scene['duration'] for scene in manifest['scenes'])
    assert 0 < total <= 180, f'Duration exceeds three-minute requirement: {total}'
    stage = HERE / 'rendered'
    stage.mkdir(exist_ok=True)
    sources = []
    all_cues = []
    elapsed = 0
    clips = []
    for scene in manifest['scenes']:
        for cue in scene['cues']:
            assert len(cue.split()) <= 8, f'Caption cue too long: {cue}'
        bg, panel = artwork(scene, stage)
        source = ROOT / scene['image']
        sources.append({'scene': scene['id'], 'kind': scene.get('kind', 'captured_ui'), 'input': scene['image'], 'original_capture': scene.get('original_capture'), 'sha256': digest(source), 'crop': scene.get('crop'), 'clip_crop': scene.get('clip_crop')})
        clip_source = None
        if scene.get('clip'):
            clip_source = (ROOT / scene['clip']).resolve()
            allowed_clip = clip_source.is_relative_to((ROOT / 'docs/evidence/ui').resolve()) or clip_source.is_relative_to((HERE / 'clips').resolve())
            if not allowed_clip or not clip_source.is_file():
                raise ValueError(f'Missing/unverified captured UI clip: {clip_source}')
            sources[-1]['actual_clip'] = scene['clip']
            sources[-1]['clip_sha256'] = digest(clip_source)
            clip_provenance = clip_source.with_suffix('.provenance.json')
            if clip_provenance.is_file():
                provenance = json.loads(clip_provenance.read_text(encoding='utf-8'))
                assert provenance['output_sha256'] == digest(clip_source)
                sources[-1]['frame_provenance'] = str(clip_provenance.relative_to(ROOT)).replace('\\', '/')
                sources[-1]['frame_provenance_sha256'] = digest(clip_provenance)
        if args.art_only:
            continue
        wav = stage / f"{scene['id']}.wav"
        cues = audio(scene, wav)
        ass = subtitles(scene, cues, stage)
        for cue in cues:
            all_cues.append({**cue, 'start': cue['start']+elapsed, 'end': cue['end']+elapsed})
        duration = scene['duration']
        clip = stage / f"{scene['id']}.mp4"
        # Use a fixed title/caption plane with an eased 1% reframing of only the
        # captured screen. This is editorial motion, not simulated UI activity.
        if clip_source:
            roi = scene.get('clip_crop', scene.get('crop', [0, 0, 1, 1]))
            media_details = probe_media(clip_source, args.ffprobe, args.ffprobe_wsl)
            captured_duration = float(media_details['format']['duration'])
            assert captured_duration < duration-1, 'Captured transition must leave a readable final-state hold'
            sources[-1]['captured_clip_duration'] = captured_duration
            captured_filter = f"setpts=PTS-STARTPTS,crop=iw*{roi[2]-roi[0]}:ih*{roi[3]-roi[1]}:iw*{roi[0]}:ih*{roi[1]},scale={PANEL[2]}:{PANEL[3]}:force_original_aspect_ratio=decrease,pad={PANEL[2]}:{PANEL[3]}:(ow-iw)/2:(oh-ih)/2:color=white,fps={FPS},tpad=stop_mode=clone:stop_duration={duration}"
            captured_input = ['-i', str(clip_source)]
            final_input = ['-loop', '1', '-framerate', str(FPS), '-i', str(panel)]
            captured_plane = f"[1:v]{captured_filter}[transition];[3:v]format=rgba,fade=t=in:st={captured_duration}:d=0.25:alpha=1[result];[transition][result]overlay=0:0:shortest=1[screen]"
        else:
            captured_filter = f"zoompan=z='1+0.010*(0.5-0.5*cos(PI*min(on/{duration*FPS},1)))':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={PANEL[2]}x{PANEL[3]}:fps={FPS}"
            captured_input = ['-loop', '1', '-framerate', str(FPS), '-i', str(panel)]
            final_input = []
            captured_plane = f'[1:v]{captured_filter}[screen]'
        filter_graph = f"{captured_plane};[0:v][screen]overlay={PANEL[0]}:{PANEL[1]}:shortest=1,ass={ass.name},fade=t=in:st=0:d=0.25:color=0xF7F7F8,fade=t=out:st={duration-0.2}:d=0.2:color=0xF7F7F8[v]"
        command = [args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', str(FPS), '-i', str(bg), *captured_input, '-i', str(wav), *final_input, '-filter_complex', filter_graph, '-map', '[v]', '-map', '2:a', '-t', str(duration), '-r', str(FPS), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', str(clip)]
        result = subprocess.run(command, cwd=stage, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr[-6000:])
        clips.append(clip)
        elapsed += duration
        print(f"Rendered {scene['id']}: {duration}s; narrated through {cues[-1]['end']:.2f}s", flush=True)
    if digest(manifest_path) != manifest_digest:
        raise ValueError('Manifest changed during rendering; preserve clips and review the new inputs before rerendering')
    (HERE / 'input-provenance.json').write_text(json.dumps({'manifest_sha256': manifest_digest, 'sources': sources, 'scope': manifest['scope']}, indent=2), encoding='utf-8')
    if args.art_only:
        print('Artwork previews ready; no video rendered.', flush=True)
        return
    concat = stage / 'concat.txt'
    concat.write_text(''.join(f"file '{clip.name}'\n" for clip in clips), encoding='utf-8')
    out = args.output.resolve()
    if not out.is_relative_to(HERE):
        raise ValueError('Output must remain inside the assigned artifacts/demo directory')
    run([args.ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(concat), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-movflags', '+faststart', '-metadata', 'title=BondTrace — captured local prototype', '-metadata', 'comment=Edited captured local UI; generated test signers; accelerated deadlines and idle-wait cuts. Test tokens only. No devnet/public deployment asserted.', str(out)])
    srt = '\n'.join(f"{index}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{cue['text']}\n" for index, cue in enumerate(all_cues, 1))
    out.with_suffix('.en.srt').write_text(srt, encoding='utf-8')
    probe = args.ffprobe or shutil.which('ffprobe')
    check = {'planned_duration_seconds': total, 'expected_frames': total*FPS, 'output_sha256': digest(out), 'output_bytes': out.stat().st_size, 'dimensions': [WIDTH, HEIGHT], 'fps': FPS, 'voice': 'Microsoft Zira Desktop - English (United States), local SAPI, rate +1', 'scope': manifest['scope']}
    if probe or args.ffprobe_wsl:
        details = probe_media(out, probe, args.ffprobe_wsl)
        check['ffprobe'] = details
        video = next(stream for stream in details['streams'] if stream['codec_type'] == 'video')
        assert video['width'] == WIDTH and video['height'] == HEIGHT
        assert float(details['format']['duration']) <= 180
        assert int(video['nb_frames']) == total*FPS
    else:
        check['ffprobe'] = {'status': 'unavailable', 'limitation': 'FFprobe executable must be supplied by lead; dimensions and duration are not asserted as probed.'}
    # Decode the final file completely; this catches corrupt video/audio packets.
    run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-i', str(out), '-f', 'null', '-'])
    check['full_decode'] = 'passed'
    (HERE / 'render-validation.json').write_text(json.dumps(check, indent=2), encoding='utf-8')
    shutil.copy(stage / 'scene-01-preview.png', HERE / 'poster.png')
    print(f'Final video ready: {out}; planned duration {total}s; full decode passed.', flush=True)


if __name__ == '__main__':
    main()
