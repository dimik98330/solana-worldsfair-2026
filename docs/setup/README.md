# Воспроизведение установки

Основной источник: `https://github.com/Marakaya/proofpilot`, commit `e6c2a3c7af6b509cd5648884a017a610e68c739c`, версия 0.3.0. На этой машине он находится вне продукта: `C:\Users\dmitrii\Documents\proofpilot-source`.

Обычный путь из source directory после проверки scripts: `npm ci --ignore-scripts`, `npm test`, `node scripts/cli.js inspect`, затем `node scripts/cli.js install --target codex --dir 'C:\Users\dmitrii\Documents\solana\.agents\skills\proofpilot' --profiles`.

На native Windows встретились две отдельные проблемы: stalled Git pack transfer ETHGlobal и fsync read-only file handle. Сохранён [локальный Windows patch](proofpilot-windows-fsync.patch); перед повторной установкой на чистом том же commit сначала `git apply --check` и затем `git apply` этого патча **в отдельном source repository**. Он не отключает fsync и не меняет права Codex. Полный npm test также имеет отдельную locale-dependent fixture failure; это не исправлялось обходом теста.

В проекте сохранён `scripts/setup-proofpilot.mjs`: fallback загружает только нужные skill/assets директории по закреплённым commit через HTTPS, проверяет Git blob SHA каждого файла по tree этого commit и вызывает штатный installPackage. Сначала источник должен быть клонирован в соседнюю `proofpilot-source` и применён раскрытый Windows patch. Запускать из корня продукта; кэш `.local` и установленные `.agents` исключены из Git. Скрипт не выполняет login и не получает credentials. **На текущей машине переустановка не требуется.**

Проверка после установки:

```powershell
node 'C:\Users\dmitrii\Documents\proofpilot-source\scripts\cli.js' dependencies --root 'C:\Users\dmitrii\Documents\solana\.agents\skills' --status
node '.agents/skills/proofpilot/scripts/discover-sources.js' --root 'C:\Users\dmitrii\Documents\solana\.agents\skills' --capabilities
```

Требовать complete=true, все 36 skills/12 assets installed и cached helper 0.2.2; наличие файлов не означает account access. Colosseum проверять установленным setup.js --status, затем при необходимости --check-colosseum. Сохранённый доступ не заменять новым login при сетевой ошибке.

Solana MCP: официальная команда `codex mcp add solana-docs --url https://mcp.solana.com/mcp`; в этой установке allowlist — list_sections, get_documentation, Solana_Documentation_Search. Не добавлять второй сервер, если текущий уже работает. Global permissions не менять.
