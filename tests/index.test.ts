import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createExtensionHarness, type ExtensionHarness } from "../test-utils/extension.js";

let scratch: string;
let cwd: string;
let agentDir: string;
let harness: ExtensionHarness | undefined;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "pi-request-user-input-extension-"));
	cwd = join(scratch, "project");
	agentDir = join(scratch, "agent");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(() => {
	harness?.session.dispose();
	vi.unstubAllEnvs();
	rmSync(scratch, { recursive: true, force: true });
	const errors = harness?.errors ?? [];
	harness = undefined;
	expect(errors).toEqual([]);
});

describe("request-user-input extension", () => {
	test("loads its tool, flag, command, and lifecycle handler through Pi", async () => {
		harness = await createExtensionHarness({ cwd, agentDir });
		const { runner, session, extensionsResult } = harness;

		expect(extensionsResult.extensions).toHaveLength(1);
		expect(runner.getAllRegisteredTools().map((tool) => tool.definition.name)).toEqual(["request_user_input"]);
		expect(runner.getFlags().get("request-user-input")).toMatchObject({ type: "string" });
		expect(runner.getRegisteredCommands().map((command) => command.name)).toEqual(["request-user-input"]);
		expect(runner.hasHandlers("session_start")).toBe(true);

		runner.setFlagValue("request-user-input", "off");
		await harness.startSession();

		expect(session.getActiveToolNames()).toEqual(["read", "bash"]);
	});

	test("exposes a read-only model tool but excludes it from nested tool calls", async () => {
		harness = await createExtensionHarness({ cwd, agentDir });
		await harness.startSession();
		const { session, runner } = harness;

		expect(session.getAllTools().find((tool) => tool.name === "request_user_input")).toMatchObject({
			exposure: "model-only",
			annotations: { readOnlyHint: true },
		});
		expect(session.getActiveToolNames()).toContain("request_user_input");
		expect(session.agent.state.tools.map((tool) => tool.name)).toContain("request_user_input");
		expect(session.getCallableToolNames()).toEqual(["read", "bash"]);
		expect(runner.createToolContext("caller", undefined).tools.map((tool) => tool.name)).toEqual(["read", "bash"]);
	});
});
