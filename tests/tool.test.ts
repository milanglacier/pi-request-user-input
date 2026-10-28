import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { TuiMainScreen, type Terminal } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { createContext } from "../test-utils/context.js";
import {
	createRequestUserInputTool,
	NONINTERACTIVE_ENV_VAR,
} from "../src/request-user-input";
import { RequestUserInputSchema, type RequestUserInputParams } from "../src/schemas";
import type { RequestUserInputDetails } from "../src/types";

function createRenderComponent(
	args: RequestUserInputParams = {
		questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }],
	},
): ToolExecutionComponent {
	const terminal: Terminal = {
		columns: 120,
		rows: 40,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		drainInput: async () => {},
		write() {},
		moveBy() {},
		hideCursor() {},
		showCursor() {},
		clearLine() {},
		clearFromCursor() {},
		clearScreen() {},
		setTitle() {},
		setProgress() {},
		setProgramStatus() {},
	};
	const tool = createRequestUserInputTool();
	return new ToolExecutionComponent(
		tool.name,
		"call-1",
		args,
		{},
		tool,
		new TuiMainScreen(terminal),
		"/tmp",
	);
}

function renderText(component: ToolExecutionComponent, width = 120): string {
	return stripVTControlCharacters(component.render(width).join("\n")).trim();
}

describe("request_user_input tool definition", () => {
	test("creates a model-only read-only tool with the expected metadata", () => {
		const tool = createRequestUserInputTool();

		expect(tool.name).toBe("request_user_input");
		expect(tool.label).toBe("request_user_input");
		expect(tool.description).toBe(
			"Request user input for one to three short questions and wait for the response.",
		);
		expect(tool.parameters).toBe(RequestUserInputSchema);
		expect(tool.exposure).toBe("model-only");
		expect(tool.annotations).toEqual({ readOnlyHint: true });
	});
});

describe("request_user_input execution", () => {
	beforeEach(() => {
		vi.stubEnv(NONINTERACTIVE_ENV_VAR, undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns a readable summary and structured details for an open-ended question", async () => {
		const tool = createRequestUserInputTool();
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
		const tool = createRequestUserInputTool();
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
		const tool = createRequestUserInputTool();
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

	test("rejects a session whose host says no person can answer, without opening a dialog", async () => {
		vi.stubEnv(NONINTERACTIVE_ENV_VAR, "1");
		const tool = createRequestUserInputTool();
		const input = vi.fn(async () => "answer");
		const ctx = createContext({ ui: { input } });

		await expect(
			tool.execute(
				"call-3b",
				{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
				undefined,
				undefined,
				ctx,
			),
		).rejects.toThrow("No person can answer questions in this session");
		expect(input).not.toHaveBeenCalled();
	});

	test.each(["0", "true", ""])("opens the dialog when the non-interactive variable is %j", async (value) => {
		vi.stubEnv(NONINTERACTIVE_ENV_VAR, value);
		const tool = createRequestUserInputTool();
		const input = vi.fn(async () => "answer");
		const ctx = createContext({ ui: { input } });

		const result = await tool.execute(
			"call-3c",
			{ questions: [{ id: "notes", header: "Notes", question: "Any constraints?" }] },
			undefined,
			undefined,
			ctx,
		);

		expect(input).toHaveBeenCalledOnce();
		expect(result.details.response.answers["notes"]?.answers).toEqual(["user_note: answer"]);
	});

	test("rejects an empty question id", async () => {
		const tool = createRequestUserInputTool();

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
		const tool = createRequestUserInputTool();

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
		const tool = createRequestUserInputTool();
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
		const tool = createRequestUserInputTool();
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
		const tool = createRequestUserInputTool();
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
			["1. Node — Use Node", "2. Other (type your own answer)"],
			{ signal: controller.signal },
		);
		expect(ctx.ui.input).toHaveBeenCalledWith("Runtime\nWhich runtime?\nOther answer", "Type your answer", {
			signal: controller.signal,
		});
	});
});

describe("request_user_input rendering", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	test("renders the question count in the call row", () => {
		const component = createRenderComponent({
			questions: [
				{ id: "one", header: "One", question: "Q1" },
				{ id: "two", header: "Two", question: "Q2" },
			],
		});

		expect(renderText(component, 80)).toBe("request_user_input 2 questions");
	});

	test("renders singular question counts", () => {
		const component = createRenderComponent({
			questions: [{ id: "one", header: "One", question: "Q1" }],
		});

		expect(renderText(component, 80)).toBe("request_user_input 1 question");
	});

	test("renders the partial state", () => {
		const component = createRenderComponent();
		component.updateResult(
			{
				content: [],
				details: { questions: [], response: { answers: {} } },
				isError: false,
			},
			true,
		);

		expect(renderText(component)).toContain("Waiting for user input...");
	});

	test("renders answered questions with their answers", () => {
		const component = createRenderComponent();
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
		component.updateResult({
			content: [{ type: "text", text: "summary" }],
			details,
			isError: false,
		});

		const text = renderText(component);
		expect(text).toContain("1. Which runtime?");
		expect(text).toContain("Answer: Node");
		expect(text).toContain("2. Any constraints?");
		expect(text).toContain("Answer: (no answer)");
	});

	test.each([undefined, {}])("falls back to text for an error with details %j", (details) => {
		const component = createRenderComponent();
		component.updateResult({
			content: [{ type: "text", text: "fallback output" }],
			details,
			isError: true,
		});

		expect(renderText(component)).toContain("fallback output");
	});
});
