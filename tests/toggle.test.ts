import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { CONFIG_FILE_NAME } from "../src/settings";
import { COMMAND_NAME, FLAG_NAME } from "../src/toggle";
import {
	createExtensionHarness,
	type ExtensionHarness,
	type ExtensionHarnessOptions,
} from "../test-utils/extension.js";

const TOOL = "request_user_input";
// Pi reads the agent dir from this variable; the package does not export the name.
const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

let scratch: string;
let agentDir: string;
let cwd: string;
let harness: ExtensionHarness | undefined;

function writeConfig(dir: string, enabled: boolean): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, CONFIG_FILE_NAME), JSON.stringify({ enabled }));
}

async function loadHarness(options: Omit<ExtensionHarnessOptions, "cwd" | "agentDir"> = {}) {
	harness = await createExtensionHarness({ cwd, agentDir, ...options });
	await harness.startSession();
	return harness;
}

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "pi-request-user-input-toggle-"));
	agentDir = join(scratch, "agent");
	cwd = join(scratch, "project");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	vi.stubEnv(ENV_AGENT_DIR, agentDir);
});

afterEach(() => {
	harness?.session.dispose();
	vi.unstubAllEnvs();
	rmSync(scratch, { recursive: true, force: true });
	const errors = harness?.errors ?? [];
	harness = undefined;
	expect(errors).toEqual([]);
});

describe("--request-user-input flag", () => {
	test("registers a string flag", async () => {
		const { runner } = await loadHarness();

		expect(runner.getFlags().get(FLAG_NAME)).toMatchObject({ type: "string" });
	});

	test("keeps the tool active by default", async () => {
		const { session, notify } = await loadHarness();

		expect(session.getActiveToolNames()).toEqual(["read", "bash", TOOL]);
		expect(notify).not.toHaveBeenCalled();
	});

	test("off deactivates the tool at session start", async () => {
		const { session, runner } = await loadHarness({ flag: "off" });

		expect(runner.getFlagValues().get(FLAG_NAME)).toBe("off");
		expect(session.getActiveToolNames()).toEqual(["read", "bash"]);
		expect(session.getAllTools().map((tool) => tool.name)).toContain(TOOL);
	});

	test("on overrides a config file that disables the tool", async () => {
		writeConfig(agentDir, false);
		writeConfig(join(cwd, ".pi"), false);

		const { session } = await loadHarness({ flag: "on" });

		expect(session.getActiveToolNames()).toContain(TOOL);
	});

	test("an invalid value shows a warning and falls back to the config", async () => {
		writeConfig(agentDir, false);

		const { session, notify } = await loadHarness({ flag: "maybe" });

		expect(session.getActiveToolNames()).not.toContain(TOOL);
		expect(notify).toHaveBeenCalledWith(
			'request_user_input: Ignoring --request-user-input "maybe": expected on or off.',
			"warning",
		);
	});
});

describe("request-user-input.json", () => {
	test("a global config with enabled: false deactivates the tool", async () => {
		writeConfig(agentDir, false);

		const { session } = await loadHarness();

		expect(session.getActiveToolNames()).not.toContain(TOOL);
	});

	test("a project config overrides the global config", async () => {
		writeConfig(agentDir, false);
		writeConfig(join(cwd, ".pi"), true);

		const { session } = await loadHarness();

		expect(session.getActiveToolNames()).toContain(TOOL);
	});

	test("an untrusted project's config is ignored", async () => {
		writeConfig(join(cwd, ".pi"), false);

		const { session, runner } = await loadHarness({ projectTrusted: false });

		expect(runner.createContext().isProjectTrusted()).toBe(false);
		expect(session.getActiveToolNames()).toContain(TOOL);
	});

	test("a malformed config warns without preventing startup", async () => {
		writeConfig(agentDir, false);
		mkdirSync(join(cwd, ".pi"), { recursive: true });
		writeFileSync(join(cwd, ".pi", CONFIG_FILE_NAME), "{");

		const { session, notify } = await loadHarness();

		expect(session.getActiveToolNames()).not.toContain(TOOL);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Ignoring malformed"), "warning");
	});

	test("every session start re-reads config after a command changes the state", async () => {
		const current = await loadHarness();
		const { session, runner } = current;
		await session.prompt(`/${COMMAND_NAME} off`);
		expect(session.getActiveToolNames()).not.toContain(TOOL);

		await current.startSession();
		expect(session.getActiveToolNames()).toContain(TOOL);

		writeConfig(agentDir, false);
		await current.startSession();

		expect(session.extensionRunner).toBe(runner);
		expect(session.getActiveToolNames()).not.toContain(TOOL);
	});

	test("every session start re-applies the flag after a command changes the state", async () => {
		const current = await loadHarness({ flag: "off" });
		await current.session.prompt(`/${COMMAND_NAME} on`);
		expect(current.session.getActiveToolNames()).toContain(TOOL);

		await current.startSession();

		expect(current.session.getActiveToolNames()).not.toContain(TOOL);
	});
});

describe("/request-user-input", () => {
	test("toggles the tool without an argument", async () => {
		const { session, notify } = await loadHarness();

		await session.prompt(`/${COMMAND_NAME}`);
		expect(session.getActiveToolNames()).not.toContain(TOOL);
		expect(notify).toHaveBeenLastCalledWith("request_user_input disabled.", "info");

		await session.prompt(`/${COMMAND_NAME}    `);
		expect(session.getActiveToolNames()).toContain(TOOL);
		expect(notify).toHaveBeenLastCalledWith("request_user_input enabled.", "info");
		expect(session.messages).toEqual([]);
	});

	test("toggle switches the current state", async () => {
		const { session } = await loadHarness();

		await session.prompt(`/${COMMAND_NAME} toggle`);

		expect(session.getActiveToolNames()).not.toContain(TOOL);
	});

	test("on and off set the state and are idempotent", async () => {
		const { session } = await loadHarness();

		await session.prompt(`/${COMMAND_NAME} off`);
		await session.prompt(`/${COMMAND_NAME} off`);
		expect(session.getActiveToolNames()).toEqual(["read", "bash"]);

		await session.prompt(`/${COMMAND_NAME} ON`);
		await session.prompt(`/${COMMAND_NAME} on`);
		expect(session.getActiveToolNames()).toEqual(["read", "bash", TOOL]);
	});

	test("keeps the other active tools in order", async () => {
		const { session } = await loadHarness();
		session.setActiveToolsByName(["bash", TOOL, "read"]);

		await session.prompt(`/${COMMAND_NAME} off`);
		expect(session.getActiveToolNames()).toEqual(["bash", "read"]);

		await session.prompt(`/${COMMAND_NAME} on`);
		expect(session.getActiveToolNames()).toEqual(["bash", "read", TOOL]);
	});

	test("rejects an unknown argument without changing the state", async () => {
		const { session, notify } = await loadHarness();
		const active = session.getActiveToolNames();

		await session.prompt(`/${COMMAND_NAME} maybe`);

		expect(session.getActiveToolNames()).toEqual(active);
		expect(notify).toHaveBeenCalledWith("Usage: /request-user-input [on|off|toggle]", "error");
	});

	test("Pi ignores unknown tool names when changing the active set", async () => {
		const { session } = await loadHarness();
		session.setActiveToolsByName(["read", "unknown_tool"]);

		await session.prompt(`/${COMMAND_NAME} on`);

		expect(session.getActiveToolNames()).toEqual(["read", TOOL]);
	});

	test("warns when Pi's tool allowlist prevents activation", async () => {
		const { session, runner, notify } = await loadHarness({ tools: ["read"] });
		expect(runner.getToolDefinition(TOOL)).toBeDefined();
		expect(session.getAllTools().map((tool) => tool.name)).toEqual(["read"]);

		await session.prompt(`/${COMMAND_NAME} on`);

		expect(session.getActiveToolNames()).toEqual(["read"]);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("is not available in this session"), "warning");
	});

	test("completes on, off, and toggle from Pi's registered command", async () => {
		const { runner } = await loadHarness();
		const complete = runner.getCommand(COMMAND_NAME)?.getArgumentCompletions;
		if (!complete) {
			throw new Error(`/${COMMAND_NAME} has no argument completions`);
		}

		expect((await complete(""))?.map((item) => item.value)).toEqual(["toggle", "on", "off"]);
		expect((await complete("o"))?.map((item) => item.value)).toEqual(["on", "off"]);
		expect((await complete(" O "))?.map((item) => item.value)).toEqual(["on", "off"]);
		expect(await complete("x")).toBeNull();
	});
});
