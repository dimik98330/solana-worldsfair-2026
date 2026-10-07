# Demo / technical overview — checkpoint

08.10.2026, подзадача `kase_demo_assets`. Scope только `docs/18-TECHNICAL-OVERVIEW.md` и `artifacts/demo/**`. Root app, contracts, config, dependencies, Git, account/consent, upload и публикация не изменялись. Lead обновляет `docs/00-STATE.md`.

Готовы английский technical overview, MP4, локальная озвучка Zira, встроенные английские captions + SRT + WebVTT (44 matching cues), постер, проверенный manifest, frozen evidence/JPEGs и исходники сборки. Финальное видео: `C:\Users\dmitrii\Documents\solana\artifacts\demo\bondtrace-product-demo.mp4`. Доставленные файлы зафиксированы в `final-assets.json` для независимого review.

- FFprobe Ubuntu `8.0.1-3ubuntu2`: **174.021333с**, 1920×1080, H.264/AAC, 30fps, **5220frames**.
- Размер: **8326931bytes**; SHA256 **dea318affc6ab6c1286f2a2cf749ce8e4d6348491e32f75e3b6fd41c57b6440c**.
- Полное декодирование FFmpeg прошло. Manifest/caption bounds, реальные WAV durations, inputs/clip hashes проверены; финальные action/result кадры просмотрены. Crop таблицы исправлен: все три строки 10/5/3 и 500/250/150 полностью видны.
- Финальные данные browser issue **5knY93zt91XKMqnxz2ukXGHVzx6Ro9vgKsrcrT3RbhJU** сохранены отдельно, checkedAt **2026-10-07T19:40:55.4418372Z**: 16 confirmed activity, coupon900, principal18000, redeemed18, vault0, yes10.
- Старый full-smoke **C9KpFDHagCG3sNi6FJqFx3RTaUW38oLqkUFkxpFLUuhN**, checkedAt18:46:40Z, показан отдельной evidence card; не выдан за новый recorded issue.

Ролик использует реальные CUA action/pending/confirmed frame captures и реальные итоговые скрины. Исходный темп quantized к 30fps; затем идёт reading hold на captured result. Idle record/maturity ожидание вырезано с маркировкой. Таблица Paid показана как **последующий вид immutable rights после settlement**. Generated test signers, localnet, test tokens и монтаж обозначены. Continuous recording / human-wallet signing / devnet / real securities / KASE integration не заявлены.

Skills фактически прочитаны и использованы: **ProofPilot coach** (routing, submit, evidence, safety, presentations, quality), **marketing-video** (professional-quality-guide, video-storytelling), **video-craft** (frame-composition, product-demo-patterns), **design-taste** (theme-references, anti-ai-slop; focused design-judgment). User/lead уже задали продукт, аудиторию KASE, Swiss cobalt и лимит3мин — interview/design loop не повторялся. Remotion отсутствует в bundled runtime; применены существующие Pillow + FFmpeg7.1 и локальный Windows SAPI. Новых npm/API/paid dependencies этот агент не устанавливал.

В docs18 обновлены отдельный browser evidence cutoff, 9 Node tests (5client/domain+4 mocked transport), 5 UI tests, viewport375/768/1280 и unsigned Escape/focus/no-wallet проверки по integration-lead checkpoint. Source `docs/17-VALIDATION.md` на момент чтения ещё содержал старые5/3/ongoing; lead должен завершить своё согласованное обновление. Human signing/rejection и unknown RPC в human-wallet path, mobile OS/device, fresh-host reproduction, devnet/public hosting/access, production audit и submission остаются отдельными gates. Никаких официальных баллов или готовности финальной подачи агент не заявляет.

Основные review artifacts: `scenes.json`, `frozen-inputs.json`, `input-provenance.json`, `render-validation.json`, `qa/final-snapshot.png`, `README.md`, `docs/18-TECHNICAL-OVERVIEW.md`. `rendered/`, `audio/`, `qa/`, test/head draft JSON — локальные промежуточные артефакты; решение о staging/ignore у lead. Root `.gitignore` не изменялся. Значимые previous draft media сохранены в `rendered/draft-01*` и `draft-02*`; final digest выше относится только к окончательному MP4.

Продолжение MUST: прочитать AGENTS/STATE и подходящие фактически установленные skills; сохранить ownership, проверенные cutoffs, bounded-review историю и stopping gate. Final external publication/submission и owner consents по-прежнему контролирует lead/владелец. Изготовленные файлы и эта самопроверка не заменяют отдельный application-readiness review.
