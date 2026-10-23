import type {
	ExtensionAPI,
	ExtensionContext,
	RegisteredCommand,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import requestUserInputExtension from "../index";
import { CONFIG_FILE_NAME } from "../src/settings";
import { COMMAND_NAME, FLAG_NAME } from "../src/toggle";
import { createCommandContext, createContext } from "../test-utils/context.js";

const TOOL = "request_user_input";
// Pi reads the agent dir from this variable; the package does not export the name.
const ENV_AGENT_DIR = "PI_CODING_AGENT_DIR";

type CommandOptions = Omit<RegisteredCommand, "name" | "sourceInfo">;
type SessionStartHandler = (event: SessionStartEvent, ctx: ExtensionContext) => unknown;

interface FakePiOptions {
	flag?: string;
	/** Tools Pi knows about. `setActiveTools` ignores the rest, as Pi does. */
	registered?: string[];
}

function createFakePi(options: FakePiOptions = {}) {
	const registered = new Set(options.registered ?? ["read", "bash"]);
	let active = [...registered];
	const flags = new Map<string, unknown>();
	const commands = new Map<string, CommandOptions>();
	const sessionStartHandlers: SessionStartHandler[] = [];
	const setActiveTools = vi.fn((names: string[]) => {
		active = names.filter((name) => registered.has(name));
	});

	const pi = {
		registerTool(tool: { name: string }) {
			if (options.registered === undefined || options.registered.includes(tool.name)) {
				registered.add(tool.name);
				active.push(tool.name);
			}
		},
		registerFlag(name: string, flag: unknown) {
			flags.set(name, flag);
		},
		getFlag(name: string) {
			return name === FLAG_NAME ? options.flag : undefined;
		},
		registerCommand(name: string, command: CommandOptions) {
			commands.set(name, command);
		},
		on(event: string, handler: SessionStartHandler) {
			if (event === "session_start") {
				sessionStartHandlers.push(handler);
			}
			return () => {};
		},
		getActiveTools: () => [...active],
		setActiveTools,
	} as unknown as ExtensionAPI;

	requestUserInputExtension(pi);

	return {
		flags,
		setActiveTools,
		getActive: () => [...active],
		async startSession(ctx: ExtensionContext = createContext()) {
			for (const handler of sessionStartHandlers) {
				await handler({ type: "session_start", reason: "startup" }, ctx);
			}
		},
		async runCommand(args: string, notify = vi.fn()) {
			const command = commands.get(COMMAND_NAME);
			if (!command) {
				throw new Error(`/${COMMAND_NAME} was not registered`);
			}
			await command.handler(args, createCommandContext({ ui: { notify } }));
			return notify;
		},
		getCommand: () => commands.get(COMMAND_NAME),
	};
}

let scratch: string;
let agentDir: string;
let cwd: string;

function writeConfig(dir: string, enabled: boolean): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, CONFIG_FILE_NAME), JSON.stringify({ enabled }));
}

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "pi-request-user-input-toggle-"));
	agentDir = join(scratch, "agent");
	cwd = join(scratch, "project");
	mkdirSync(cwd, { recursive: true });
	vi.stubEnv(ENV_AGENT_DIR, agentDir);
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(scratch, { recursive: true, force: true });
});

describe("--request-user-input flag", () => {
	test("registers a string flag", () => {
		const fake = createFakePi();

		expect(fake.flags.get(FLAG_NAME)).toMatchObject({ type: "string" });
	});

	test("keeps the tool active by default", async () => {
		const fake = createFakePi();

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).toEqual(["read", "bash", TOOL]);
		expect(fake.setActiveTools).not.toHaveBeenCalled();
	});

	test("off deactivates the tool at session start", async () => {
		const fake = createFakePi({ flag: "off" });

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).toEqual(["read", "bash"]);
	});

	test("on overrides a config file that disables the tool", async () => {
		writeConfig(agentDir, false);
		writeConfig(join(cwd, ".pi"), false);
		const fake = createFakePi({ flag: "on" });

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).toContain(TOOL);
	});

	test("an invalid value shows a warning and falls back to the config", async () => {
		writeConfig(agentDir, false);
		const fake = createFakePi({ flag: "maybe" });
		const notify = vi.fn();

		await fake.startSession(createContext({ cwd, ui: { notify } }));

		expect(fake.getActive()).not.toContain(TOOL);
		expect(notify).toHaveBeenCalledWith(
			'request_user_input: Ignoring --request-user-input "maybe": expected on or off.',
			"warning",
		);
	});
});

describe("request-user-input.json", () => {
	test("a global config with enabled: false deactivates the tool", async () => {
		writeConfig(agentDir, false);
		const fake = createFakePi();

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).not.toContain(TOOL);
	});

	test("a project config overrides the global config", async () => {
		writeConfig(agentDir, false);
		writeConfig(join(cwd, ".pi"), true);
		const fake = createFakePi();

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).toContain(TOOL);
	});

	test("an untrusted project's config is ignored", async () => {
		writeConfig(join(cwd, ".pi"), false);
		const fake = createFakePi();

		await fake.startSession(createContext({ cwd, isProjectTrusted: () => false }));

		expect(fake.getActive()).toContain(TOOL);
	});

	test("session start re-applies the config after /request-user-input changed it", async () => {
		const fake = createFakePi();
		await fake.runCommand("off");

		await fake.startSession(createContext({ cwd }));

		expect(fake.getActive()).toContain(TOOL);
	});
});

describe("/request-user-input", () => {
	test("toggles the tool without an argument", async () => {
		const fake = createFakePi();

		const off = await fake.runCommand("");
		expect(fake.getActive()).not.toContain(TOOL);
		expect(off).toHaveBeenCalledWith("request_user_input disabled.", "info");

		const on = await fake.runCommand("   ");
		expect(fake.getActive()).toContain(TOOL);
		expect(on).toHaveBeenCalledWith("request_user_input enabled.", "info");
	});

	test("toggle switches the current state", async () => {
		const fake = createFakePi();

		await fake.runCommand("toggle");

		expect(fake.getActive()).not.toContain(TOOL);
	});

	test("on and off set the state and are idempotent", async () => {
		const fake = createFakePi();

		await fake.runCommand("off");
		await fake.runCommand("off");
		expect(fake.getActive()).toEqual(["read", "bash"]);

		await fake.runCommand("ON");
		await fake.runCommand("on");
		expect(fake.getActive()).toEqual(["read", "bash", TOOL]);
	});

	test("keeps the other active tools in order", async () => {
		const fake = createFakePi();

		await fake.runCommand("off");

		expect(fake.setActiveTools).toHaveBeenCalledWith(["read", "bash"]);
	});

	test("rejects an unknown argument without changing the state", async () => {
		const fake = createFakePi();

		const notify = await fake.runCommand("maybe");

		expect(fake.getActive()).toContain(TOOL);
		expect(fake.setActiveTools).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Usage: /request-user-input [on|off|toggle]", "error");
	});

	test("warns when Pi cannot activate the tool", async () => {
		// The tool is missing from the registry, as when --tools leaves it out.
		const fake = createFakePi({ registered: ["read"] });

		const notify = await fake.runCommand("on");

		expect(fake.getActive()).toEqual(["read"]);
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("is not available in this session"), "warning");
	});

	test("completes on, off, and toggle", async () => {
		const fake = createFakePi();
		const complete = fake.getCommand()?.getArgumentCompletions;

		expect((await complete?.(""))?.map((item) => item.value)).toEqual(["toggle", "on", "off"]);
		expect((await complete?.("o"))?.map((item) => item.value)).toEqual(["on", "off"]);
		expect(await complete?.("x")).toBeNull();
	});
});
