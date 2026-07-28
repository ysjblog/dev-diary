# Final Closer Contradiction Matrix

## 中文摘要

本矩陣記錄 `SOL-FC-003`：Release 的不可變提交與後續文件提交被誤寫為同一個「目前 main」。修正只拆開兩者的意義，沒有改動 DMG、tag、Release 或遠端目標。

| Finding | Contradiction | Root cause | Fix boundary | Landing check |
|---|---|---|---|---|
| SOL-FC-003 | `8c71412` 是 `v0.1.2` 與發佈當下 `origin/main`；`7d7aec5` 是其後的本機文件提交。 | 文件把 release candidate 與 current documentation revision 混為單一 source of truth。 | `design.md`、closeout review records。 | `git rev-list v0.1.2...HEAD`、`git ls-remote origin main`、Release readback。 |
