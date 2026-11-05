#!/usr/bin/env python3
"""
Static checker for Clean Architecture rules in a NestJS project.

Usage:
    python3 check_architecture.py <project-root> [--src src] [--json]

Layers are inferred from path segments:
    .../<module>/domain/...        -> domain
    .../<module>/application/...   -> application
    .../<module>/infra[structure]/... -> infra
    .../<module>/presentation/...  -> presentation (also accepts "http", "interface")
    src/core/**                    -> core (treated like domain: must be framework-free)
Files in a module outside those folders (e.g. users.module.ts), app.module.ts and
main.ts are composition roots and may import anything.

Checks (ERROR unless noted):
  R1  Dependency rule between layers.
  R2  Framework / infrastructure packages imported from domain, application or core.
  R3  `throw` inside domain, application or core (use Either instead).
  R4  Importing another module's infra/ or presentation/ from outside a composition root.
  R5  File outside every layer that is not a composition root (*.module.ts, main.ts, src/config/**).
  W1  (warning) `any` type in domain, application or core.
  W2  (warning) Unknown third-party package in domain, application or core.
  W3  (warning) Decorator usage in domain, application or core.

Spec files (*.spec.ts, *.test.ts), *.d.ts and anything under test/ are ignored.
Exit code: 1 if any ERROR, else 0.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

LAYER_ALIASES = {
    "domain": "domain",
    "application": "application",
    "infra": "infra",
    "infrastructure": "infra",
    "presentation": "presentation",
    "http": "presentation",
    "interface": "presentation",
}
PURE_LAYERS = {"domain", "application", "core"}

# which layers each layer may import from (composition roots are unrestricted)
ALLOWED = {
    "core": {"core"},
    "domain": {"core", "domain"},
    "application": {"core", "domain", "application"},
    "infra": {"core", "domain", "application", "infra"},
    "presentation": {"core", "domain", "application", "presentation"},
}

FORBIDDEN_PKG_PATTERNS = [
    r"^@nestjs/", r"^typeorm", r"^@prisma/", r"^prisma$", r"^mongoose", r"^sequelize",
    r"^class-validator", r"^class-transformer", r"^express", r"^fastify", r"^@fastify/",
    r"^bcrypt", r"^bcryptjs", r"^argon2", r"^jsonwebtoken", r"^passport", r"^axios",
    r"^node-fetch", r"^got$", r"^pg$", r"^mysql", r"^ioredis", r"^redis", r"^kafkajs",
    r"^amqplib", r"^bull", r"^@aws-sdk/", r"^nodemailer", r"^rxjs", r"^reflect-metadata",
    r"^dotenv", r"^@sentry/", r"^winston", r"^pino",
]
NODE_BUILTINS = {
    "crypto", "util", "events", "assert", "buffer", "url", "string_decoder", "path",
}
# Node built-ins that are infrastructure (I/O) and therefore forbidden in the core
NODE_IO = {"fs", "fs/promises", "http", "https", "net", "child_process", "os", "dgram", "tls", "cluster", "worker_threads"}

IMPORT_RE = re.compile(
    r"""(?:\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+|\brequire\(\s*|\bimport\(\s*)['"]([^'"]+)['"]""",
    re.MULTILINE,
)
THROW_RE = re.compile(r"\bthrow\b")
ANY_RE = re.compile(r"(?::\s*any\b|<any>|\bas\s+any\b|any\[\])")
DECORATOR_RE = re.compile(r"^\s*@[A-Za-z_]\w*\s*\(", re.MULTILINE)


@dataclass
class Issue:
    severity: str
    rule: str
    file: str
    line: int
    message: str


@dataclass
class FileInfo:
    path: Path
    layer: str | None  # None = composition root / unclassified
    module: str | None


def strip_comments(code: str) -> str:
    # keep line count stable: replace comment chars with spaces/newlines
    def block(m: re.Match) -> str:
        return re.sub(r"[^\n]", " ", m.group(0))
    code = re.sub(r"/\*[\s\S]*?\*/", block, code)
    code = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), code)
    return code


def strip_strings(code: str) -> str:
    return re.sub(r"(['\"`])(?:\\.|(?!\1).)*\1", lambda m: m.group(1) + " " * (len(m.group(0)) - 2) + m.group(1), code)


def classify(path: Path, src: Path) -> FileInfo:
    rel = path.relative_to(src).parts
    if rel and rel[0] == "core":
        return FileInfo(path, "core", "core")
    for i, seg in enumerate(rel[:-1]):
        if seg in LAYER_ALIASES:
            module = rel[i - 1] if i > 0 else None
            return FileInfo(path, LAYER_ALIASES[seg], module)
    # module root files (composition roots)
    module = None
    if len(rel) >= 3 and rel[0] in ("modules", "features", "contexts"):
        module = rel[1]
    return FileInfo(path, None, module)


def is_composition_root(path: Path, src: Path) -> bool:
    rel = path.relative_to(src).parts
    return (
        path.name.endswith(".module.ts")
        or rel == ("main.ts",)
        or (len(rel) > 1 and rel[0] == "config")
    )


def load_aliases(root: Path, src: Path) -> list[tuple[str, Path]]:
    aliases: list[tuple[str, Path]] = [("@/", src), ("~/", src), ("src/", src)]
    tsconfig = root / "tsconfig.json"
    if tsconfig.exists():
        try:
            raw = strip_comments(tsconfig.read_text(encoding="utf-8"))
            raw = re.sub(r",(\s*[}\]])", r"\1", raw)
            data = json.loads(raw)
            opts = data.get("compilerOptions", {})
            base = root / opts.get("baseUrl", ".")
            for key, targets in (opts.get("paths") or {}).items():
                if not targets:
                    continue
                prefix = key.rstrip("*")
                target = targets[0].rstrip("*")
                aliases.insert(0, (prefix, (base / target).resolve()))
        except Exception:
            pass
    return aliases


def resolve(spec: str, importer: Path, aliases: list[tuple[str, Path]]) -> Path | None:
    if spec.startswith("."):
        return (importer.parent / spec).resolve()
    for prefix, target in aliases:
        if prefix and spec.startswith(prefix):
            return (target / spec[len(prefix):]).resolve()
    return None


def is_external(spec: str) -> bool:
    return not spec.startswith(".") and not spec.startswith("/")


def line_of(code: str, idx: int) -> int:
    return code.count("\n", 0, idx) + 1


def check(root: Path, src_name: str) -> list[Issue]:
    root = root.resolve()
    src = (root / src_name).resolve()
    if not src.is_dir():
        raise SystemExit(f"source dir not found: {src}")
    aliases = load_aliases(root, src)
    issues: list[Issue] = []

    files = [
        p for p in src.rglob("*.ts")
        if not p.name.endswith((".spec.ts", ".test.ts", ".d.ts", ".e2e-spec.ts"))
        and "node_modules" not in p.parts and "__tests__" not in p.parts
    ]

    for path in files:
        info = classify(path, src)
        rel = str(path.relative_to(root))
        code = strip_comments(path.read_text(encoding="utf-8"))

        # R5: every file must belong to a layer, unless it is a composition root
        if info.layer is None and not is_composition_root(path, src):
            issues.append(Issue("ERROR", "R5", rel, 1,
                "file is outside every layer. Move it into <module>/{domain,application,infra,presentation}/ "
                "(only *.module.ts, main.ts and src/config/** may live outside the layers)."))

        for m in IMPORT_RE.finditer(code):
            spec = m.group(1)
            ln = line_of(code, m.start())

            if is_external(spec) and resolve(spec, path, aliases) is None:
                if info.layer in PURE_LAYERS:
                    bare = spec[5:] if spec.startswith("node:") else spec
                    if bare in NODE_IO or bare.split("/")[0] in NODE_IO:
                        issues.append(Issue("ERROR", "R2", rel, ln,
                            f"{info.layer} imports I/O built-in '{spec}'. Put it behind a port implemented in infra."))
                    elif any(re.match(p, spec) for p in FORBIDDEN_PKG_PATTERNS):
                        issues.append(Issue("ERROR", "R2", rel, ln,
                            f"{info.layer} imports framework/infrastructure package '{spec}'. The core must be framework-free; define a port and implement it in infra."))
                    elif bare not in NODE_BUILTINS:
                        issues.append(Issue("WARN", "W2", rel, ln,
                            f"{info.layer} imports third-party package '{spec}'. Allowed only if it is a pure, dependency-free utility; otherwise wrap it in a port."))
                continue

            target = resolve(spec, path, aliases)
            if target is None:
                continue
            try:
                target.relative_to(src)
            except ValueError:
                continue  # outside src (e.g. test/) — not our concern here
            # resolve directory/index or file without extension
            candidate = target
            for ext in ("", ".ts", "/index.ts"):
                p = Path(str(target) + ext)
                if p.exists():
                    candidate = p
                    break
            if candidate.is_dir():
                candidate = candidate / "index.ts"
            tinfo = classify(candidate if candidate.suffix else candidate.with_suffix(".ts"), src)

            # R4 cross-module leak
            if (info.layer is not None and tinfo.module and info.module and tinfo.module != info.module
                    and tinfo.layer in ("infra", "presentation") and info.module != "core"):
                issues.append(Issue("ERROR", "R4", rel, ln,
                    f"module '{info.module}' imports '{tinfo.module}/{tinfo.layer}' ('{spec}'). Depend on the other module's exported port or use case instead."))
                continue

            # R1 dependency rule
            if info.layer is None:
                continue  # composition root
            if tinfo.layer is None:
                if tinfo.module and info.layer in PURE_LAYERS | {"infra", "presentation"}:
                    issues.append(Issue("ERROR", "R1", rel, ln,
                        f"{info.layer} imports a composition root / unclassified file '{spec}'. Only modules may import modules."))
                continue
            if tinfo.layer not in ALLOWED[info.layer]:
                issues.append(Issue("ERROR", "R1", rel, ln,
                    f"{info.layer} must not depend on {tinfo.layer} ('{spec}'). Dependencies point inward: presentation/infra -> application -> domain."))

        if info.layer in PURE_LAYERS:
            code_ns = strip_strings(code)
            for m in THROW_RE.finditer(code_ns):
                issues.append(Issue("ERROR", "R3", rel, line_of(code_ns, m.start()),
                    "`throw` in the core. Return a DomainError with left(...) and map it to HTTP in presentation."))
            for m in ANY_RE.finditer(code_ns):
                issues.append(Issue("WARN", "W1", rel, line_of(code_ns, m.start()),
                    "`any` in the core weakens the contracts; use a precise type or `unknown`."))
            for m in DECORATOR_RE.finditer(code_ns):
                issues.append(Issue("WARN", "W3", rel, line_of(code_ns, m.start()),
                    "decorator in the core. Wire use cases with useFactory in the module instead."))

    return issues


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--src", default="src")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    issues = check(Path(args.root), args.src)
    errors = [i for i in issues if i.severity == "ERROR"]
    warns = [i for i in issues if i.severity == "WARN"]

    if args.json:
        print(json.dumps([asdict(i) for i in issues], indent=2))
    else:
        for i in sorted(issues, key=lambda x: (x.severity != "ERROR", x.file, x.line)):
            print(f"[{i.severity}] {i.rule} {i.file}:{i.line} — {i.message}")
        print(f"\n{len(errors)} error(s), {len(warns)} warning(s)")
        if not issues:
            print("Architecture OK: dependency rule, core purity and module boundaries respected.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
