import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";

import requestUserInputExtension from "../index";
import { RequestUserInputSchema } from "../src/schemas";
import type { RequestUserInputDetails } from "../src/types";

describe("request-user-input extension", () => {
	test("registers the request_user_input tool on load", () => {
		const registerTool = vi.fn();
		const pi = { registerTool } as unknown as ExtensionAPI;

		requestUserInputExtension(pi);

		expect(registerTool).toHaveBeenCalledOnce();
		const tool = registerTool.mock.calls[0]?.[0] as
			| ToolDefinition<typeof RequestUserInputSchema, RequestUserInputDetails>
			| undefined;
		expect(tool?.name).toBe("request_user_input");
	});
});
