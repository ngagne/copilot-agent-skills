#!/usr/bin/env python3
"""Shared helper-agent utilities backed by the Copilot CLI."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


COPILOT_SKILLS_DIR = Path.home() / ".copilot" / "skills"


@dataclass
class CopilotSessionResult:
    """Structured result from a helper-agent session."""

    events: list[dict]
    raw_output: str
    usage: dict | None


def ensure_copilot_cli() -> None:
    """Raise if the local Copilot CLI is unavailable."""
    if shutil.which("copilot") is None:
        raise RuntimeError(
            "copilot CLI not found in PATH. The helper-agent backend requires "
            "the local Copilot CLI."
        )


def run_helper_agent(
    prompt: str,
    *,
    model: str | None = None,
    timeout: int = 300,
    cwd: Path | None = None,
) -> CopilotSessionResult:
    """Run an isolated helper-agent session and return parsed JSON events."""
    ensure_copilot_cli()

    cmd = ["copilot"]
    if cwd is not None:
        cmd.extend(["-C", str(cwd)])
    cmd.extend(
        [
            "-p",
            prompt,
            "--output-format",
            "json",
            "--stream",
            "off",
            "--no-color",
            "--no-ask-user",
            "--allow-all-tools",
        ]
    )
    if model:
        cmd.extend(["--model", model])

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"copilot exited {result.returncode}\n"
            f"stdout: {result.stdout}\n"
            f"stderr: {result.stderr}"
        )

    events: list[dict] = []
    usage: dict | None = None
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        events.append(event)
        if event.get("type") == "result":
            usage = event.get("usage")

    return CopilotSessionResult(events=events, raw_output=result.stdout, usage=usage)


def extract_final_response_text(session: CopilotSessionResult) -> str:
    """Return the final assistant text from a helper-agent session."""
    for event in reversed(session.events):
        if event.get("type") != "assistant.message":
            continue
        data = event.get("data", {})
        content = data.get("content", "")
        if content and not data.get("toolRequests"):
            return content

    for event in reversed(session.events):
        if event.get("type") != "assistant.message":
            continue
        content = event.get("data", {}).get("content", "")
        if content:
            return content

    raise RuntimeError("No assistant response found in helper-agent session output.")


def skill_was_invoked(events: list[dict], skill_name: str) -> bool:
    """Return whether the named skill was invoked in the event stream."""
    for event in events:
        if event.get("type") == "tool.execution_start":
            data = event.get("data", {})
            if data.get("toolName") == "skill" and data.get("arguments", {}).get("skill") == skill_name:
                return True

        if event.get("type") != "assistant.message":
            continue

        for tool_request in event.get("data", {}).get("toolRequests", []):
            if tool_request.get("name") == "skill" and tool_request.get("arguments", {}).get("skill") == skill_name:
                return True

    return False


def _slugify_skill_name(skill_name: str) -> str:
    """Normalize a temporary skill name to the local validator's rules."""
    slug = re.sub(r"[^a-z0-9]+", "-", skill_name.lower()).strip("-")
    slug = re.sub(r"-{2,}", "-", slug)
    if not slug:
        slug = "temp-skill"
    return slug[:55].rstrip("-") or "temp-skill"


@contextmanager
def installed_temp_skill(
    skill_name: str,
    description: str,
) -> Iterator[tuple[str, Path]]:
    """Install a temporary skill into Copilot's skill directory for evals."""
    ensure_copilot_cli()

    temp_skill_name = f"{_slugify_skill_name(skill_name)}-{uuid.uuid4().hex[:8]}"
    skill_dir = COPILOT_SKILLS_DIR / temp_skill_name
    COPILOT_SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    description_lines = description.splitlines() or [description]
    indented_desc = "\n  ".join(description_lines)
    skill_md = (
        "---\n"
        f"name: {temp_skill_name}\n"
        "description: |\n"
        f"  {indented_desc}\n"
        "metadata:\n"
        '  version: "1.0.0"\n'
        "---\n\n"
        f"# {skill_name}\n\n"
        "When this skill is used during a trigger eval, respond with exactly "
        f'"TRIGGERED-{temp_skill_name}".\n'
    )

    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")

    try:
        yield temp_skill_name, skill_dir
    finally:
        shutil.rmtree(skill_dir, ignore_errors=True)
