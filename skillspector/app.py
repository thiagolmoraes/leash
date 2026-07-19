"""
Minimal HTTP shim around the skillspector CLI.
Exposes POST /scan { url } -> the raw skillspector JSON report.
"""
import json
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()


class ScanRequest(BaseModel):
    url: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/scan")
def scan(req: ScanRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(400, "url is required")

    with tempfile.TemporaryDirectory() as tmp:
        report_path = Path(tmp) / "report.json"
        cmd = [
            "skillspector",
            "scan",
            req.url,
            "--no-llm",
            "--format",
            "json",
            "--output",
            str(report_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

        if not report_path.exists():
            raise HTTPException(
                502,
                f"skillspector produced no report (exit {result.returncode}): "
                f"{result.stderr[-2000:] or result.stdout[-2000:]}",
            )

        return json.loads(report_path.read_text())
