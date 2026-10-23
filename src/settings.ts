import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE_NAME = "request-user-input.json";

export interface RequestUserInputSettings {
	enabled?: boolean;
}

export interface ResolveEnabledOptions {
	cwd: string;
	projectTrusted: boolean;
	/** Raw value of the `--request-user-input` CLI flag. */
	flag: boolean | string | undefined;
}

export interface ResolvedEnabled {
	enabled: boolean;
	warnings: string[];
}

export function globalConfigPath(): string {
	return join(getAgentDir(), CONFIG_FILE_NAME);
}

export function projectConfigPath(cwd: string): string {
	return join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

/** Parses `on`/`off` (and `true`/`false`). Returns undefined for anything else. */
export function parseOnOff(value: string): boolean | undefined {
	switch (value.trim().toLowerCase()) {
		case "on":
		case "true":
			return true;
		case "off":
		case "false":
			return false;
		default:
			return undefined;
	}
}

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

/** A missing file is silent. An unreadable or invalid file adds a warning and is ignored. */
export function readConfigFile(path: string, warnings: string[]): RequestUserInputSettings {
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (error) {
		if (errorCode(error) !== "ENOENT") {
			const reason = error instanceof Error ? error.message : String(error);
			warnings.push(`Ignoring ${path}: ${reason}`);
		}
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		warnings.push(`Ignoring malformed ${path}: ${reason}`);
		return {};
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		warnings.push(`Ignoring ${path}: expected a JSON object.`);
		return {};
	}

	if (!("enabled" in parsed) || parsed.enabled === undefined) {
		return {};
	}
	if (typeof parsed.enabled !== "boolean") {
		warnings.push(`Ignoring "enabled" in ${path}: expected true or false.`);
		return {};
	}
	return { enabled: parsed.enabled };
}

/**
 * Resolves whether the tool is enabled. Precedence: CLI flag, project config, global config,
 * then the default (enabled). The project config is read only when the project is trusted.
 */
export function resolveEnabled(options: ResolveEnabledOptions): ResolvedEnabled {
	const warnings: string[] = [];
	let enabled = true;

	const global = readConfigFile(globalConfigPath(), warnings);
	if (global.enabled !== undefined) {
		enabled = global.enabled;
	}

	if (options.projectTrusted) {
		const project = readConfigFile(projectConfigPath(options.cwd), warnings);
		if (project.enabled !== undefined) {
			enabled = project.enabled;
		}
	}

	if (typeof options.flag === "string") {
		const fromFlag = parseOnOff(options.flag);
		if (fromFlag === undefined) {
			warnings.push(`Ignoring --request-user-input ${JSON.stringify(options.flag)}: expected on or off.`);
		} else {
			enabled = fromFlag;
		}
	}

	return { enabled, warnings };
}
