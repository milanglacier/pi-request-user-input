import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";

import requestUserInputExtension from "../index";
import { RequestUserInputSchema } from "../src/schemas";
import type { RequestUserInputDetails } from "../src/types";

describe("request-user-input extension", () => {
	test("registers the tool, the flag, the command, and a session_start handler on load", () => {
		const registerTool = vi.fn();
		const registerFlag = vi.fn();
		const registerCommand = vi.fn();
		const on = vi.fn();
		const pi = { registerTool, registerFlag, registerCommand, on } as unknown as ExtensionAPI;

		requestUserInputExtension(pi);

		expect(registerTool).toHaveBeenCalledOnce();
		const tool = registerTool.mock.calls[0]?.[0] as
			| ToolDefinition<typeof RequestUserInputSchema, RequestUserInputDetails>
			| undefined;
		expect(tool?.name).toBe("request_user_input");
		expect(registerFlag).toHaveBeenCalledWith("request-user-input", expect.objectContaining({ type: "string" }));
		expect(registerCommand).toHaveBeenCalledWith("request-user-input", expect.anything());
		expect(on).toHaveBeenCalledWith("session_start", expect.any(Function));
	});
});
