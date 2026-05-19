#!/usr/bin/env python3
"""
Quick validation script for skills - minimal version
"""

import re
import sys
from pathlib import Path

import yaml


ALLOWED_PROPERTIES = {
    "name",
    "description",
    "metadata",
}
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SEMVER_PATTERN = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")

def validate_skill(skill_path):
    """Validate a skill's SKILL.md frontmatter against the local skill-creator contract."""
    skill_path = Path(skill_path)

    # Check SKILL.md exists
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return False, "SKILL.md not found"

    # Read and validate frontmatter
    content = skill_md.read_text(encoding="utf-8")
    if not content.startswith('---'):
        return False, "No YAML frontmatter found"

    # Extract frontmatter
    match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not match:
        return False, "Invalid frontmatter format"

    frontmatter_text = match.group(1)

    # Parse YAML frontmatter
    try:
        frontmatter = yaml.safe_load(frontmatter_text)
        if not isinstance(frontmatter, dict):
            return False, "Frontmatter must be a YAML dictionary"
    except yaml.YAMLError as e:
        return False, f"Invalid YAML in frontmatter: {e}"

    # Check for unexpected properties (excluding nested keys under metadata)
    unexpected_keys = set(frontmatter.keys()) - ALLOWED_PROPERTIES
    if unexpected_keys:
        return False, (
            f"Unexpected key(s) in SKILL.md frontmatter: {', '.join(sorted(unexpected_keys))}. "
            f"Allowed properties are: {', '.join(sorted(ALLOWED_PROPERTIES))}"
        )

    # Check required fields
    if 'name' not in frontmatter:
        return False, "Missing 'name' in frontmatter"
    if 'description' not in frontmatter:
        return False, "Missing 'description' in frontmatter"
    if 'metadata' not in frontmatter:
        return False, "Missing 'metadata' in frontmatter"

    # Extract name for validation
    name = frontmatter.get('name', '')
    if not isinstance(name, str):
        return False, f"Name must be a string, got {type(name).__name__}"
    name = name.strip()
    if not name:
        return False, "Name must be a non-empty string"
    if len(name) > 64:
        return False, f"Name is too long ({len(name)} characters). Maximum is 64 characters."
    if not NAME_PATTERN.fullmatch(name):
        return False, (
            f"Name '{name}' must use lowercase letters, digits, and single hyphens only, "
            "with no leading, trailing, or consecutive hyphens"
        )
    if name != skill_path.name:
        return False, f"Name '{name}' must match the parent directory name '{skill_path.name}'"

    # Extract and validate description
    description = frontmatter.get('description', '')
    if not isinstance(description, str):
        return False, f"Description must be a string, got {type(description).__name__}"
    description = description.strip()
    if not description:
        return False, "Description must be a non-empty string"
    if len(description) > 1024:
        return False, f"Description is too long ({len(description)} characters). Maximum is 1024 characters."

    metadata = frontmatter.get('metadata')
    if not isinstance(metadata, dict):
        return False, f"Metadata must be a mapping, got {type(metadata).__name__}"
    for key, value in metadata.items():
        if not isinstance(key, str):
            return False, f"Metadata keys must be strings, got {type(key).__name__}"
        if not isinstance(value, str):
            return False, f"Metadata value for '{key}' must be a string, got {type(value).__name__}"

    if 'version' not in metadata:
        return False, "Metadata must contain a 'version' property"
    version = metadata.get('version', '').strip()
    if not version:
        return False, "Metadata version must be a non-empty string"
    if not SEMVER_PATTERN.fullmatch(version):
        return False, (
            f"Metadata version '{version}' must use semver format MAJOR.MINOR.PATCH"
        )

    return True, "Skill frontmatter matches the local skill-creator contract."

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python quick_validate.py <skill_directory>")
        sys.exit(1)
    
    valid, message = validate_skill(sys.argv[1])
    print(message)
    sys.exit(0 if valid else 1)
