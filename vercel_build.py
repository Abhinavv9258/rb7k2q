from pathlib import Path
import os
import shutil
import subprocess


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"
NPM = "npm.cmd" if os.name == "nt" else "npm"

subprocess.run([NPM, "ci"], cwd=FRONTEND, check=True)
subprocess.run([NPM, "run", "build"], cwd=FRONTEND, check=True)
shutil.copytree(FRONTEND / "dist", ROOT / "backend" / "static", dirs_exist_ok=True)
