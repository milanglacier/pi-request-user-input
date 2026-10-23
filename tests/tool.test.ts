import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { describe, expect, test, vi } from "vitest";

import { createContext } from "../test-utils/context.js";
import {
	createRequestUserInputTool,
	registerRequestUserInputTool,
	type RequestUserInputTool,
} from "../src/request-user-input";
import { RequestUserInputSchema } from "../src/schemas";
import type { RequestUserInputDetails } from "../src/types";

function createExtensionApi(): { pi: ExtensionAPI; getTool: () => RequestUserInputTool } {
	let registered: RequestUserInputTool | undefined;
	const pi = {
		registerTool(tool: RequestUserInputTool) {
			registered = tool;
		},
	} as unknown as ExtensionAPI;
	return {
		pi,
		getTool() {
			if (!registered) {
				throw new Error("request_user_input was not registered");
			}
			return registered;
		},
	};
}

function createTheme() {
	const fg = vi.fn((_color: string, text: string) => text);
	const bold = vi.fn((text: string) => text);
	return {
		theme: { fg, bold } as unknown as Theme,
		fg,
		bold,
	};
}

type RenderContext = Parameters<NonNullable<RequestUserInputTool["renderCall"]>>[2];

function renderContext(): RenderContext {
	return {
		args: { questions: [] },
		toolCallId: "call-1",
		invalidate: () => {},
		lastComponent: undefined,
		state: {},
		cwd: "/tmp",
		executionStarted: true,
		argsComplete: true,
		isPartial: false,
		expanded: false,
		showImages: false,
		isError: false,
		durationMs: undefined,
		outputPad: 0,
	};
}

describe("request_user_input tool registration", () => {
	test("registers a model-only read-only tool with the expected metadata", () => {
		const { pi, getTool } = createExtensionApi();

		const returned = registerRequestUserInputTool(pi);
		const tool = getTool();

		expect(returned).toBe(tool);
		expect(tool.name).toBe("request_user_input");
		expect(tool.label).toBe("request_user_input");
		expect(tool.description).toBe(
			"Request user input for one to three short questions and wait for the response.",
		);
		expect(tool.parameters).toBe(RequestUserInputSchema);
		expect(tool.exposure).toBe("model-only");
		expect(tool.annotations).toEqual({ readOnlyHint: true });
	});

	test("createRequestUserInputTool returns the same registration contract without an API", () => {
		const tool = createRequestUserInputTool();

		expect(tool.name).toBe("request_user_input");
		expect(tool.parameters).toBe(RequestUserInputSchema);
	});
});

describe("request_user_input execution", () => {
	test("returns a readable summary and structured details for an open-ended question", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const ctx = createContext({
			ui: {
				input: vi.fn(async () => "Ship in two phases"),
			},
		});

		const result = await tool.execute(
			"call-1",
			{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
			undefined,
			undefined,
			ctx,
		);

		expect(result.details.questions).toEqual([
			{ id: "notes", header: "Notes", question: "Any constraints?", options: [] },
		]);
		expect(result.details.response).toEqual({
			answers: { notes: { answers: ["user_note: Ship in two phases"] } },
		});
		expect(result.content).toEqual([
			{
				type: "text",
				text: "1. Any constraints?\n   Answer: Ship in two phases",
			},
		]);
	});

	test("returns Other plus the follow-up answer for a multiple-choice question", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const ctx = createContext({
			ui: {
				input: vi.fn(async () => "Bun"),
				select: vi.fn(async () => "2. Other (type your own answer)"),
			},
		});

		const result = await tool.execute(
			"call-2",
			{
				questions: [
					{
						id: "runtime",
						header: "Runtime",
						question: "Which runtime?",
						options: [{ label: "Node", description: "Use Node" }],
					},
				],
			},
			undefined,
			undefined,
			ctx,
		);

		expect(result.details.response.answers["runtime"]?.answers).toEqual(["Other", "user_note: Bun"]);
		expect(result.content).toEqual([
			{
				type: "text",
				text: "1. Which runtime?\n   Answer: Other (Bun)",
			},
		]);
	});

	test("rejects a session without UI support", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const ctx = createContext({ hasUI: false });

		await expect(
			tool.execute(
				"call-3",
				{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("request_user_input requires UI support");
	});

	test("rejects an empty question id", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();

		await expect(
			tool.execute(
				"call-4",
				{ questions: [{ id: " ", header: "Notes", question: "Any constraints?" }] },
				undefined,
				undefined,
				createContext(),
			),
		).rejects.toThrow("request_user_input question ids must be non-empty.");
	});

	test("rejects duplicate question ids", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();

		await expect(
			tool.execute(
				"call-5",
				{
					questions: [
						{ id: "runtime", header: "One", question: "Q1" },
						{ id: "runtime", header: "Two", question: "Q2" },
					],
				},
				undefined,
				undefined,
				createContext(),
			),
		).rejects.toThrow("Duplicate id: runtime");
	});

	test("rejects a cancelled dialog", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const ctx = createContext({ ui: { input: vi.fn(async () => undefined) } });

		await expect(
			tool.execute(
				"call-6",
				{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("request_user_input was cancelled by the user");
	});

	test("reports an aborted call as aborted instead of cancelled", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const controller = new AbortController();
		controller.abort();
		const ctx = createContext({ ui: { input: vi.fn(async () => undefined) } });

		await expect(
			tool.execute(
				"call-7",
				{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
				controller.signal,
				undefined,
				ctx,
			),
		).rejects.toThrow("request_user_input was aborted");
	});

	test("forwards the abort signal to every dialog", async () => {
		const { pi, getTool } = createExtensionApi();
		registerRequestUserInputTool(pi);
		const tool = getTool();
		const controller = new AbortController();
		const ctx = createContext({
			ui: {
				input: vi.fn(async () => "Bun"),
				select: vi.fn(async () => "2. Other (type your own answer)"),
			},
		});

		await tool.execute(
			"call-8",
			{
				questions: [
					{
						id: "runtime",
						header: "Runtime",
						question: "Which runtime?",
						options: [{ label: "Node", description: "Use Node" }],
					},
				],
			},
			controller.signal,
			undefined,
			ctx,
		);

		expect(ctx.ui.select).toHaveBeenCalledWith(
			"Runtime\nWhich runtime?",
			["1. Node", "2. Other (type your own answer)"],
			{ signal: controller.signal },
		);
		expect(ctx.ui.input).toHaveBeenCalledWith("Runtime\nWhich runtime?\nOther answer", "Type your answer", {
			signal: controller.signal,
		});
	});
});

describe("request_user_input rendering", () => {
	test("renders the question count in the call row", () => {
		const tool = createRequestUserInputTool();
		const { theme } = createTheme();
		const component = tool.renderCall?.(
			{
				questions: [
					{ id: "one", header: "One", question: "Q1" },
					{ id: "two", header: "Two", question: "Q2" },
				],
			},
			theme,
			renderContext(),
		);

		expect(component?.render(80).join("\n").trimEnd()).toBe("request_user_input 2 questions");
	});

	test("renders singular question counts", () => {
		const tool = createRequestUserInputTool();
		const { theme } = createTheme();
		const component = tool.renderCall?.(
			{ questions: [{ id: "one", header: "One", question: "Q1" }] },
			theme,
			renderContext(),
		);

		expect(component?.render(80).join("\n").trimEnd()).toBe("request_user_input 1 question");
	});

	test("renders the partial state", () => {
		const tool = createRequestUserInputTool();
		const { theme } = createTheme();
		const component = tool.renderResult?.(
			{ content: [], details: { questions: [], response: { answers: {} } } },
			{ expanded: false, isPartial: true },
			theme,
			renderContext(),
		);

		expect(component?.render(80).join("\n").trimEnd()).toBe("Waiting for user input...");
	});

	test("renders answered questions with their answers", () => {
		const tool = createRequestUserInputTool();
		const { theme, fg } = createTheme();
		const details: RequestUserInputDetails = {
			questions: [
				{ id: "runtime", header: "Runtime", question: "Which runtime?", options: [] },
				{ id: "notes", header: "Notes", question: "Any constraints?", options: [] },
			],
			response: {
				answers: {
					runtime: { answers: ["Node"] },
					notes: { answers: [] },
				},
			},
		};
		const result: AgentToolResult<RequestUserInputDetails> = {
			content: [{ type: "text", text: "summary" }],
			details,
		};

		const component = tool.renderResult?.(
			result,
			{ expanded: false, isPartial: false },
			theme,
			renderContext(),
		);

		const text = component?.render(120).join("\n");
		expect(text).toContain("1. Which runtime?");
		expect(text).toContain("Answer: Node");
		expect(text).toContain("2. Any constraints?");
		expect(text).toContain("Answer: (no answer)");
		expect(fg).toHaveBeenCalledWith("warning", "(no answer)");
	});

	test("falls back to the text content when details are missing", () => {
		const tool = createRequestUserInputTool();
		const { theme } = createTheme();
		const result = {
			content: [{ type: "text", text: "fallback output" }],
			details: undefined as unknown as RequestUserInputDetails,
		} as AgentToolResult<RequestUserInputDetails>;

		const component = tool.renderResult?.(
			result,
			{ expanded: false, isPartial: false },
			theme,
			renderContext(),
		);

		expect(component?.render(80).join("\n").trimEnd()).toBe("fallback output");
	});
});
