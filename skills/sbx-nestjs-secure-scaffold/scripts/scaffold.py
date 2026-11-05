#!/usr/bin/env python3
"""
Generate a NestJS API (Clean Architecture + security defaults) from the bundled template.

Usage:
    python3 scaffold.py --name my-api --out ./my-api --database postgres
    python3 scaffold.py --name my-api --out ./my-api --database none
    python3 scaffold.py ... --latest          # resolve newest compatible versions with `npm view`

Options:
    --name        package / project name (kebab-case)
    --out         target directory (must not exist or be empty)
    --database    postgres | none
                    postgres: PostgreSQL + TypeORM, full auth (register, login, refresh rotation, logout, scopes)
                    none:     no database; validates JWTs issued by an external identity provider + scopes
    --latest      query npm for the latest versions inside the supported majors (needs network)

Template conventions:
    Line markers in any text file:  `// #if db`, `// #if !db`, `// #else`, `// #endif`
    (or with `#` instead of `//` for YAML, .env, Dockerfile, Markdown).
    Placeholders: __APP_NAME__, __APP_DB__, __NEST_VERSION__.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

TEMPLATE = Path(__file__).resolve().parent.parent / "assets" / "template"

# Known-good set, validated together (lint, typecheck, unit, e2e, build).
# Majors are the supported range; --latest only moves within them.
DEPENDENCIES = {
    "@nestjs/common": "12.3.3",
    "@nestjs/config": "12.1.0",
    "@nestjs/core": "12.3.3",
    "@nestjs/jwt": "12.0.3",
    "@nestjs/platform-express": "12.3.3",
    "@nestjs/swagger": "12.1.0",
    "@nestjs/terminus": "12.1.0",
    "@nestjs/throttler": "6.7.1",
    "class-transformer": "0.5.1",
    "class-validator": "0.15.1",
    "helmet": "8.3.0",
    "nestjs-pino": "5.3.1",
    "pino": "10.4.0",
    "pino-http": "11.0.0",
    "@prometheus-io/client": "0.16.1",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "zod": "4.6.7",
}
DB_DEPENDENCIES = {
    "@nestjs/typeorm": "12.0.2",
    "argon2": "0.45.2",
    "dotenv": "18.0.9",
    "pg": "8.23.1",
    "typeorm": "1.1.2",
}
DEV_DEPENDENCIES = {
    "@eslint/js": "10.0.1",
    "@nestjs/cli": "12.0.11",
    "@nestjs/schematics": "12.0.12",
    "@nestjs/testing": "12.3.3",
    "@types/express": "5.0.6",
    "@types/jest": "30.0.0",
    "@types/node": "26.6.6",
    "@types/supertest": "7.2.1",
    "eslint": "10.14.0",
    "eslint-config-prettier": "10.1.8",
    "globals": "17.14.0",
    "jest": "30.5.2",
    "pino-pretty": "13.2.0",
    "prettier": "3.9.10",
    "source-map-support": "0.5.21",
    "supertest": "7.3.1",
    "ts-jest": "29.4.15",
    # capped: @nestjs/cli pins ~6.0, ts-jest and typescript-eslint support < 7
    "typescript": "6.0.3",
    "typescript-eslint": "8.72.1",
}
# version ranges allowed when --latest is used (npm semver ranges)
LATEST_RANGES = {"typescript": "~6.0", "@types/node": "^26"}

DB_ONLY = [
    "src/modules/auth/",
    "src/config/database.config.ts",
    "src/config/data-source.ts",
    "src/shared/infra/database/",
    "test/auth/",
    "test/shared/fake-clock.ts",
]
NO_DB_ONLY = ["src/modules/me/"]
TEXT_SUFFIXES = {
    ".ts", ".js", ".mjs", ".json", ".yml", ".yaml", ".md", ".alloy", ".example", ".py", ".txt", "",
}
JEST = "node --experimental-vm-modules ./node_modules/jest/bin/jest.js"
MARKER = re.compile(r"^\s*(?://|#)\s*#(if|else|endif)\b\s*(!?\w+)?\s*$")


def process_markers(text: str, flags: dict[str, bool], source: str) -> str:
    out: list[str] = []
    stack: list[tuple[bool, bool]] = []  # (parent_active, branch_active)
    active = True
    for lineno, line in enumerate(text.splitlines(keepends=True), 1):
        m = MARKER.match(line)
        if not m:
            if active:
                out.append(line)
            continue
        kind, cond = m.group(1), m.group(2)
        if kind == "if":
            if not cond:
                raise SystemExit(f"{source}:{lineno}: #if without condition")
            neg = cond.startswith("!")
            value = flags[cond.lstrip("!")]
            branch = (not value) if neg else value
            stack.append((active, branch))
            active = active and branch
        elif kind == "else":
            if not stack:
                raise SystemExit(f"{source}:{lineno}: #else without #if")
            parent, branch = stack[-1]
            stack[-1] = (parent, not branch)
            active = parent and not branch
        else:
            if not stack:
                raise SystemExit(f"{source}:{lineno}: #endif without #if")
            active = stack.pop()[0]
    if stack:
        raise SystemExit(f"{source}: unterminated #if")
    return "".join(out)


def npm_latest(name: str, current: str) -> str:
    rng = LATEST_RANGES.get(name, f"^{current.split('.')[0]}" if not current.startswith("0.") else f"~{'.'.join(current.split('.')[:2])}")
    try:
        res = subprocess.run(["npm", "view", f"{name}@{rng}", "version", "--json"],
                             capture_output=True, text=True, timeout=60, check=True)
        data = json.loads(res.stdout)
        return data[-1] if isinstance(data, list) else data
    except Exception as exc:  # network or registry issue: keep the validated version
        print(f"  ! could not resolve latest {name}@{rng} ({exc.__class__.__name__}); keeping {current}")
        return current


def build_package_json(name: str, db: bool, latest: bool) -> dict:
    deps = dict(DEPENDENCIES, **(DB_DEPENDENCIES if db else {}))
    dev = dict(DEV_DEPENDENCIES)
    if latest:
        print("Resolving latest compatible versions from npm...")
        deps = {k: npm_latest(k, v) for k, v in deps.items()}
        dev = {k: npm_latest(k, v) for k, v in dev.items()}

    scripts = {
        "build": "nest build",
        "start": "nest start",
        "start:dev": "nest start --watch",
        "start:debug": "nest start --debug --watch",
        "start:prod": "node dist/main.js",
        "lint": "eslint \"{src,test}/**/*.ts\"",
        "format": "prettier --write \"{src,test}/**/*.ts\"",
        "typecheck": "tsc --noEmit -p tsconfig.json",
        # NestJS 12 ships ESM; Jest loads it from CJS through require(esm) (Node >= 24.9)
        "test": f"{JEST}",
        "test:watch": f"{JEST} --watch",
        "test:cov": f"{JEST} --coverage",
        "test:e2e": f"{JEST} --config test/jest-e2e.json --runInBand",
        "arch:check": "python3 scripts/check-architecture.py .",
    }
    if db:
        cli = "node node_modules/typeorm/cli.js"
        scripts.update({
            "migration:generate": f"npm run build && {cli} migration:generate -d dist/config/data-source.js src/modules/${{npm_config_module:-auth}}/infra/database/typeorm/migrations/${{npm_config_name}}",
            "migration:run": f"npm run build && {cli} migration:run -d dist/config/data-source.js",
            "migration:revert": f"npm run build && {cli} migration:revert -d dist/config/data-source.js",
            "migration:run:prod": f"{cli} migration:run -d dist/config/data-source.js",
        })

    return {
        "name": name,
        "version": "0.1.0",
        "private": True,
        "license": "UNLICENSED",
        "engines": {"node": ">=24.11"},
        "scripts": scripts,
        "dependencies": dict(sorted((k, f"^{v}") for k, v in deps.items())),
        "devDependencies": dict(sorted(
            (k, (f"~{v}" if k == "typescript" else f"^{v}")) for k, v in dev.items()
        )),
        "jest": {
            "moduleFileExtensions": ["js", "json", "ts"],
            "rootDir": ".",
            "testRegex": "src/.*\\.spec\\.ts$",
            "transform": {"^.+\\.ts$": "ts-jest"},
            "moduleNameMapper": {"^@/(.*)$": "<rootDir>/src/$1"},
            "collectCoverageFrom": [
                "src/**/*.ts", "!src/main.ts", "!src/**/*.module.ts",
                "!src/**/migrations/**", "!src/config/data-source.ts",
            ],
            "coverageDirectory": "coverage",
            "testEnvironment": "node",
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--database", choices=["postgres", "none"], required=True)
    ap.add_argument("--latest", action="store_true")
    args = ap.parse_args()

    if not re.fullmatch(r"[a-z][a-z0-9-]{1,213}", args.name):
        raise SystemExit("--name must be kebab-case (lowercase letters, digits, hyphens)")
    out = Path(args.out).resolve()
    if out.exists() and any(out.iterdir()):
        raise SystemExit(f"{out} exists and is not empty")

    db = args.database == "postgres"
    flags = {"db": db}
    pkg = build_package_json(args.name, db, args.latest)
    replacements = {
        "__APP_NAME__": args.name,
        "__APP_DB__": args.name.replace("-", "_"),
        "__NEST_VERSION__": pkg["dependencies"]["@nestjs/core"].lstrip("^~"),
    }

    files = 0
    for src in sorted(TEMPLATE.rglob("*")):
        if not src.is_file() or "__pycache__" in src.parts:
            continue
        rel = src.relative_to(TEMPLATE).as_posix()
        if not db and any(rel == p or rel.startswith(p) for p in DB_ONLY):
            continue
        if db and any(rel == p or rel.startswith(p) for p in NO_DB_ONLY):
            continue
        dest = out / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.suffix in TEXT_SUFFIXES or src.name.startswith("."):
            text = process_markers(src.read_text(encoding="utf-8"), flags, rel)
            for key, value in replacements.items():
                text = text.replace(key, value)
            dest.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(src, dest)
        if src.stat().st_mode & 0o111:
            dest.chmod(0o755)
        files += 1

    (out / "package.json").write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    files += 1

    leftovers = [p for p in out.rglob("*") if p.is_file() and "__APP_" in p.read_text(errors="ignore")]
    if leftovers:
        raise SystemExit(f"unreplaced placeholders in: {leftovers}")

    print(f"Scaffolded {files} files into {out}")
    print(f"  database: {args.database} | auth: {'full (JWT + rotating refresh tokens + scopes)' if db else 'resource server (JWT validation + scopes)'}")
    print("Next: cd into it, `npm install`, `cp .env.example .env` and replace every CHANGE_ME.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
