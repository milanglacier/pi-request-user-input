import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { REQUEST_USER_INPUT_TOOL_NAME } from "./request-user-input";
import { CONFIG_FILE_NAME, parseOnOff, resolveEnabled } from "./settings";

export const FLAG_NAME = "request-user-input";
export const COMMAND_NAME = "request-user-input";

const COMMAND_ARGUMENTS: AutocompleteItem[] = [
	{ value: "toggle", label: "toggle", description: "Switch request_user_input on or off (default)" },
	{ value: "on", label: "on", description: "Enable request_user_input" },
	{ value: "off", label: "off", description: "Disable request_user_input" },
];

export function isRequestUserInputEnabled(pi: ExtensionAPI): boolean {
	return pi.getActiveTools().includes(REQUEST_USER_INPUT_TOOL_NAME);
}

/**
 * Adds the tool to or removes it from the active tool set, which is the set declared to the model.
 * Returns whether the tool is active afterwards. Pi ignores tools it does not know, so enabling can
 * fail, for example when `--tools` leaves the tool out.
 */
export function setRequestUserInputEnabled(pi: ExtensionAPI, enabled: boolean): boolean {
	const active = pi.getActiveTools();
	const isActive = active.includes(REQUEST_USER_INPUT_TOOL_NAME);
	if (enabled && !isActive) {
		pi.setActiveTools([...active, REQUEST_USER_INPUT_TOOL_NAME]);
	} else if (!enabled && isActive) {
		pi.setActiveTools(active.filter((name) => name !== REQUEST_USER_INPUT_TOOL_NAME));
	}
	return isRequestUserInputEnabled(pi);
}

function applyStartupSetting(pi: ExtensionAPI, ctx: ExtensionContext): void {
	const { enabled, warnings } = resolveEnabled({
		cwd: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
		flag: pi.getFlag(FLAG_NAME),
	});
	for (const warning of warnings) {
		ctx.ui.notify(`request_user_input: ${warning}`, "warning");
	}
	setRequestUserInputEnabled(pi, enabled);
}

function parseCommandArgument(args: string): boolean | "toggle" | undefined {
	const value = args.trim().toLowerCase();
	if (value === "" || value === "toggle") {
		return "toggle";
	}
	return parseOnOff(value);
}

export function registerRequestUserInputToggle(pi: ExtensionAPI): void {
	pi.registerFlag(FLAG_NAME, {
		description: `Enable or disable the request_user_input tool (on|off). Overrides ${CONFIG_FILE_NAME}.`,
		type: "string",
	});

	// Re-applied on every session start, so the flag and config files win over an earlier /request-user-input.
	pi.on("session_start", (_event, ctx) => {
		applyStartupSetting(pi, ctx);
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Enable, disable, or toggle the request_user_input tool: [on|off|toggle]",
		getArgumentCompletions(prefix) {
			const normalized = prefix.trim().toLowerCase();
			const matches = COMMAND_ARGUMENTS.filter((item) => item.value.startsWith(normalized));
			return matches.length > 0 ? matches : null;
		},
		async handler(args, ctx) {
			const requested = parseCommandArgument(args);
			if (requested === undefined) {
				ctx.ui.notify(`Usage: /${COMMAND_NAME} [on|off|toggle]`, "error");
				return;
			}

			const enabled = requested === "toggle" ? !isRequestUserInputEnabled(pi) : requested;
			const active = setRequestUserInputEnabled(pi, enabled);
			if (active !== enabled) {
				ctx.ui.notify(
					`${REQUEST_USER_INPUT_TOOL_NAME} is not available in this session, for example because --tools leaves it out.`,
					"warning",
				);
				return;
			}
			ctx.ui.notify(`${REQUEST_USER_INPUT_TOOL_NAME} ${enabled ? "enabled" : "disabled"}.`, "info");
		},
	});
}
