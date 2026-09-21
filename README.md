# @alvaroak/pi-bash-guard

Confirmation gate for destructive bash commands in the [Pi coding agent](https://github.com/earendil-works/pi).

Before a matching command runs, you get a confirm prompt. Patterns cover recursive/force `rm`, `sudo`, permission bombs, force pushes, disk-level writes, piped-to-shell downloads, and fork bombs.

Subagents run headlessly with no UI to confirm against, so a dangerous command from a subagent is **blocked outright** rather than prompted — same rule as Pi's own permission-gate example.

State changes are published over `pi.events` (`bash-guard:changed`) so other extensions (e.g. a status footer) can render the shield flag.

> Adapted from [amosblomqvist/pi-config](https://github.com/amosblomqvist/pi-config) (`extensions/bash-guard`).

## Install

```bash
pi install git:github.com/Alvaroak/pi-bash-guard@v0.1.0
```

## Usage

On by default. Toggle with `/bash-guard` — state persists across session resumes.

## License

MIT
