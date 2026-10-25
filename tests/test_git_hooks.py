from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ContributorHookTests(unittest.TestCase):
    def test_generation_leaves_the_reviewed_index_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            checkout = Path(directory)
            subprocess.run(["git", "init", "--quiet", str(checkout)], check=True)
            selected = checkout / "source.txt"
            managed_paths = [
                "rule/artifact.txt",
                "cfg/artifact.txt",
                "dns/artifact.txt",
                "dist/artifact.txt",
                "apps/profile-service/worker/generated/artifact.txt",
            ]
            generated = checkout / "cfg/artifact.txt"
            selected.write_text("reviewed source\n", encoding="utf-8")
            for relative_path in managed_paths:
                artifact = checkout / relative_path
                artifact.parent.mkdir(parents=True, exist_ok=True)
                artifact.write_text("previous artifact\n", encoding="utf-8")
            subprocess.run(["git", "add", "--", selected.name, *managed_paths], cwd=checkout, check=True)
            index_before = subprocess.check_output(["git", "ls-files", "--stage"], cwd=checkout)

            tools = checkout / "test-tools"
            tools.mkdir()
            make = tools / "make"
            make.write_text("#!/bin/sh\nset -eu\n[ \"$1\" = generate ]\nprintf 'new artifact\\n' > cfg/artifact.txt\n", encoding="utf-8")
            make.chmod(0o755)
            subprocess.run(
                ["/bin/sh", str(ROOT / ".githooks/pre-commit")],
                cwd=checkout,
                env={**os.environ, "PATH": f"{tools}{os.pathsep}{os.environ.get('PATH', '')}"},
                check=True,
                capture_output=True,
            )

            self.assertEqual(generated.read_text(encoding="utf-8"), "new artifact\n")
            self.assertEqual(subprocess.check_output(["git", "ls-files", "--stage"], cwd=checkout), index_before)


if __name__ == "__main__":
    unittest.main()
