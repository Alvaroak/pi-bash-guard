/**
 * Bash guard extension.
 *
 * Confirms before running bash commands that match a curated list of
 * destructive patterns (recursive/force rm, sudo, permission bombs, force
 * pushes, disk-level writes, piped-to-shell downloads, fork bombs). On by
 * default; toggle with /bash-guard, state persists across resumes.
 *
 * Subagents run headlessly with no UI to confirm against, so a dangerous
 * command from a subagent is blocked outright rather than prompted — same
 * rule pi's own permission-gate example applies.
 *
 * Publishes state changes over pi.events ("bash-guard:changed") for
 * my-powerline-footer to render the 🛡️ shield flag (green on, red off) next
 * to the frugal flag.
 */

import { DynamicBorder, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";

interface BashGuardState {
	enabled: boolean;
}

interface MinimalTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

function createBashGuardConfirmComponent(command: string, label: string) {
	return (
		tui: { requestRender(): void },
		theme: MinimalTheme,
		_kb: unknown,
		done: (result: "allow" | "deny") => void,
	) => {
		const container = new Container();
		const redBorder = (s: string) => theme.fg("error", s);

		container.addChild(new DynamicBorder(redBorder));
		container.addChild(new Text(theme.fg("error", theme.bold("Dangerous Command Detected")), 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("warning", `This command contains ${label}:`), 1, 0));
		container.addChild(new Spacer(1));
		const commandText = new Text("", 1, 0);
		container.addChild(commandText);
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("text", "Allow execution?"), 1, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("dim", "y/enter: allow • n/esc: deny"), 1, 0));
		container.addChild(new DynamicBorder(redBorder));

		return {
			render: (width: number) => {
				const contentWidth = Math.max(1, width - 4);
				commandText.setText(wrapTextWithAnsi(theme.fg("text", command), contentWidth).join("\n"));
				return container.render(width);
			},
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
					done("allow");
				} else if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
					done("deny");
				}
				tui.requestRender();
			},
		};
	};
}

const DANGEROUS_PATTERNS: { pattern: RegExp; label: string }[] = [
	{ pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+.*-[a-z]*[rf][a-z]*|-(-recursive|-force)\b|-[a-z]*[rf]{2}[a-z]*\b)/i, label: "recursive/force delete" },
	{ pattern: /\bsudo\b/i, label: "sudo" },
	{ pattern: /\b(chmod|chown)\b.*(-R\b.*\b777\b|\b777\b.*-R\b|\b777\b)/i, label: "permission bomb (777)" },
	{ pattern: /\bgit\s+push\b.*(--force\b|-f\b)/i, label: "force push" },
	{ pattern: /\bdd\b.*\bof=\/dev\//i, label: "raw disk write" },
	{ pattern: /\bmkfs(\.\w+)?\b/i, label: "filesystem format" },
	{ pattern: />\s*\/dev\/sd[a-z]\b/i, label: "raw disk write" },
	{ pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/i, label: "curl|sh install" },
	{ pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/, label: "fork bomb" },
];

function findMatch(command: string): string | undefined {
	for (const { pattern, label } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) return label;
	}
	return undefined;
}

export default function bashGuardExtension(pi: ExtensionAPI): void {
	let enabled = true;

	function persistState(): void {
		pi.appendEntry("bash-guard-state", { enabled } satisfies BashGuardState);
	}

	function publish(): void {
		pi.events.emit("bash-guard:changed", { enabled });
	}

	pi.registerCommand("bash-guard", {
		description: "Toggle the bash guard (confirmation before destructive commands)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			persistState();
			publish();
			ctx.ui.notify(enabled ? "Bash guard enabled." : "Bash guard disabled.", "info");
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return undefined;
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;
		const match = findMatch(command);
		if (!match) return undefined;

		if (!ctx.hasUI) {
			// Subagents and other headless callers get no confirmation prompt,
			// so block outright rather than let a destructive command through.
			return { block: true, reason: `Bash guard: blocked "${match}" (no UI for confirmation)` };
		}

		const choice = await ctx.ui.custom(createBashGuardConfirmComponent(command, match));

		if (choice !== "allow") {
			return { block: true, reason: "Blocked by user" };
		}

		return undefined;
	});

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const last = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "bash-guard-state")
			.pop() as { data?: BashGuardState } | undefined;

		if (last?.data) {
			enabled = last.data.enabled;
		}
		publish();
	});
}
