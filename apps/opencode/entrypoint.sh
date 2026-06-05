#!/bin/bash
set -e

# Copy bundled skills to runtime config if not already present
BUNDLED_SKILLS="/opt/opencode-bundled-skills"
CONFIG_SKILLS="/root/.config/opencode/skills"

if [ -d "$BUNDLED_SKILLS" ]; then
  mkdir -p "$CONFIG_SKILLS"
  for skill_dir in "$BUNDLED_SKILLS"/*/; do
    skill_name=$(basename "$skill_dir")
    if [ ! -d "$CONFIG_SKILLS/$skill_name" ]; then
      echo "Installing bundled skill: $skill_name"
      cp -r "$skill_dir" "$CONFIG_SKILLS/$skill_name"
    fi
  done
fi

exec "$@"
