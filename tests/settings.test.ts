import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	CONFIG_FILE_NAME,
	globalConfigPath,
	parseOnOff,
	projectConfigPath,
	resolveEnabled,
} from "../src/settings";

// Pi reads the agent dir from this variable; the package does not export the name.
const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

let scratch: string;
let agentDir: string;
let cwd: string;

function writeConfig(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "pi-request-user-input-settings-"));
	agentDir = join(scratch, "agent");
	cwd = join(scratch, "project");
	mkdirSync(cwd, { recursive: true });
	vi.stubEnv(ENV_AGENT_DIR, agentDir);
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(scratch, { recursive: true, force: true });
});

describe("config paths", () => {
	test("reads the global file from the agent dir and the project file from .pi", () => {
		expect(globalConfigPath()).toBe(join(agentDir, CONFIG_FILE_NAME));
		expect(projectConfigPath(cwd)).toBe(join(cwd, ".pi", "request-user-input.json"));
	});
});

describe("parseOnOff", () => {
	test.each([
		["on", true],
		["ON", true],
		["true", true],
		["off", false],
		[" Off ", false],
		["false", false],
		["maybe", undefined],
		["", undefined],
	])("parses %j as %j", (value, expected) => {
		expect(parseOnOff(value)).toBe(expected);
	});
});

describe("resolveEnabled", () => {
	test("is enabled by default when no config file or flag is present", () => {
		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined })).toEqual({
			enabled: true,
			warnings: [],
		});
	});

	test("reads the global config", () => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: false }));

		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined }).enabled).toBe(false);
	});

	test("lets the project config override the global config", () => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: false }));
		writeConfig(projectConfigPath(cwd), JSON.stringify({ enabled: true }));

		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined }).enabled).toBe(true);
	});

	test("keeps the global value when the project config omits enabled", () => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: false }));
		writeConfig(projectConfigPath(cwd), JSON.stringify({}));

		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined }).enabled).toBe(false);
	});

	test("ignores the project config in an untrusted project", () => {
		writeConfig(projectConfigPath(cwd), JSON.stringify({ enabled: false }));

		expect(resolveEnabled({ cwd, projectTrusted: false, flag: undefined }).enabled).toBe(true);
	});

	test.each([
		["on", true],
		["off", false],
	])("lets --request-user-input %s override both config files", (flag, expected) => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: !expected }));
		writeConfig(projectConfigPath(cwd), JSON.stringify({ enabled: !expected }));

		expect(resolveEnabled({ cwd, projectTrusted: true, flag })).toEqual({ enabled: expected, warnings: [] });
	});

	test("warns about and ignores an invalid flag value", () => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: false }));

		const resolved = resolveEnabled({ cwd, projectTrusted: true, flag: "maybe" });

		expect(resolved.enabled).toBe(false);
		expect(resolved.warnings).toEqual(['Ignoring --request-user-input "maybe": expected on or off.']);
	});

	test("warns about and ignores malformed JSON", () => {
		writeConfig(projectConfigPath(cwd), "{ enabled: false");

		const resolved = resolveEnabled({ cwd, projectTrusted: true, flag: undefined });

		expect(resolved.enabled).toBe(true);
		expect(resolved.warnings).toHaveLength(1);
		expect(resolved.warnings[0]).toContain(`Ignoring malformed ${projectConfigPath(cwd)}`);
	});

	test("warns about and ignores a file that is not a JSON object", () => {
		writeConfig(globalConfigPath(), "[]");

		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined })).toEqual({
			enabled: true,
			warnings: [`Ignoring ${globalConfigPath()}: expected a JSON object.`],
		});
	});

	test("warns about and ignores a non-boolean enabled value", () => {
		writeConfig(globalConfigPath(), JSON.stringify({ enabled: "false" }));

		expect(resolveEnabled({ cwd, projectTrusted: true, flag: undefined })).toEqual({
			enabled: true,
			warnings: [`Ignoring "enabled" in ${globalConfigPath()}: expected true or false.`],
		});
	});

	test("warns about a config path that cannot be read", () => {
		// A directory in place of the file makes the read fail with something other than ENOENT.
		mkdirSync(globalConfigPath(), { recursive: true });

		const resolved = resolveEnabled({ cwd, projectTrusted: true, flag: undefined });

		expect(resolved.enabled).toBe(true);
		expect(resolved.warnings).toHaveLength(1);
		expect(resolved.warnings[0]).toContain(`Ignoring ${globalConfigPath()}`);
	});
});
