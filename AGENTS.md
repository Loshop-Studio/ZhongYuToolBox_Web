# Repository contribution rules

For a PR targeting Loshop-Studio/ZhongYuToolBox_Web, follow UPSTREAM_PR.md: preserve the author's existing login-count API and latest upstream UI/UX. If adding the fork's statistics switch, enable AUTHOR_STATS_DEFAULT in the upstream PR branch. Never merge this fork's disabled statistics default into upstream. Base contributions on current upstream main and adapt feature changes to its views; do not overwrite upstream views wholesale with fork versions.

For both nickfox395/ZhongYuToolBox_Web and Loshop-Studio/ZhongYuToolBox_Web releases, keep AUTHOR_STATS_DEFAULT enabled. The maintainer explicitly requested statistics remain on for all future releases on 2026-10-05. Reporting failures must never gate official authentication. Do not include account caches, private signing keys, or supplied third-party APK binaries in source commits or app packages.
