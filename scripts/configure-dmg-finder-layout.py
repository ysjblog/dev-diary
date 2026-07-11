#!/usr/bin/env python3
"""Write deterministic Finder layout metadata for the staged DevDiary DMG."""

from __future__ import annotations

import os
import struct
import sys
from pathlib import Path

from ds_store import DSStore
from mac_alias import Alias


def fail(message: str) -> None:
    raise SystemExit(f"DMG Finder layout failed: {message}")


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: configure-dmg-finder-layout.py <mounted-dmg-root>")

    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        fail("mounted DMG root is not a directory")

    background = root / ".background" / "dmg-background.png"
    if not background.is_file():
        fail("drag-install background is missing")
    if not (root / "DevDiary.app").is_dir() or not (root / "Applications").is_symlink():
        fail("DMG install items are incomplete")

    background_alias = Alias.for_file(os.fspath(background)).to_bytes()
    ds_store_path = root / ".DS_Store"
    with DSStore.open(os.fspath(ds_store_path), "w+") as store:
        store["DevDiary.app"]["Iloc"] = (180, 220)
        store["Applications"]["Iloc"] = (480, 220)
        store["."]["icvp"] = {
            "arrangeBy": "none",
            "backgroundType": 2,
            "gridOffsetX": 0.0,
            "gridOffsetY": 0.0,
            "gridSpacing": 54.0,
            "iconSize": 128.0,
            "labelOnBottom": True,
            "showIconPreview": True,
            "showItemInfo": False,
            "textSize": 16.0,
            "viewOptionsVersion": 1,
        }
        store["."]["BKGD"] = ("blob", b"PctB" + struct.pack(">I", len(background_alias)) + b"\0" * 4)
        store["."]["pict"] = ("blob", background_alias)


if __name__ == "__main__":
    main()
