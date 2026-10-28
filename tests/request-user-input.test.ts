import { describe, expect, test, vi } from "vitest";

import { createContext } from "../test-utils/context.js";
import {
	buildRequestUserInputAnswer,
	buildRequestUserInputDialogTitle,
	buildRequestUserInputResponse,
	buildRequestUserInputSummary,
	collectRequestUserInputAnswers,
	normalizeRequestUserInputQuestions,
	summarizeRequestUserInputAnswer,
	type RequestUserInputQuestionResponse,
} from "../src/request-user-input";
import type { NormalizedRequestUserInputQuestion } from "../src/types";

function normalizeOrThrow(questions: Parameters<typeof normalizeRequestUserInputQuestions>[0]) {
	const result = normalizeRequestUserInputQuestions(questions);
	if ("error" in result) {
		throw new Error(result.error);
	}
	return result.questions;
}

function createCtx(options?: {
	input?: Array<string | undefined>;
	select?: Array<string | undefined>;
}) {
	const inputValues = [...(options?.input ?? [])];
	const selectValues = [...(options?.select ?? [])];
	return createContext({
		ui: {
			input: vi.fn(async () => inputValues.shift()),
			select: vi.fn(async () => selectValues.shift()),
		},
	});
}

describe("normalizeRequestUserInputQuestions", () => {
	test("trims ids and defaults options", () => {
		const questions = normalizeOrThrow([
			{ id: " runtime ", header: "Runtime", question: "Which runtime?" },
		]);

		expect(questions[0]).toEqual({
			id: "runtime",
			header: "Runtime",
			question: "Which runtime?",
			options: [],
		});
	});

	test("keeps explicit options", () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);

		expect(questions[0]?.options).toEqual([{ label: "Node", description: "Use Node" }]);
	});

	test("rejects empty and whitespace-only ids", () => {
		expect(normalizeRequestUserInputQuestions([{ id: "", header: "One", question: "Q1" }])).toEqual({
			error: "request_user_input question ids must be non-empty.",
		});
		expect(normalizeRequestUserInputQuestions([{ id: "  ", header: "One", question: "Q1" }])).toEqual({
			error: "request_user_input question ids must be non-empty.",
		});
	});

	test("rejects duplicate ids", () => {
		const result = normalizeRequestUserInputQuestions([
			{ id: "runtime", header: "One", question: "Q1" },
			{ id: " runtime ", header: "Two", question: "Q2" },
		]);

		expect(result).toEqual({
			error: "request_user_input question ids must be unique. Duplicate id: runtime",
		});
	});
});

describe("buildRequestUserInputAnswer", () => {
	const baseQuestion: NormalizedRequestUserInputQuestion = {
		id: "runtime",
		header: "Runtime",
		question: "Which runtime?",
		options: [],
	};

	function response(overrides: Partial<RequestUserInputQuestionResponse> = {}): RequestUserInputQuestionResponse {
		return {
			selectedOptionIndex: 0,
			customText: "",
			selectionTouched: false,
			committed: true,
			...overrides,
		};
	}

	test("returns no answer for an empty open-ended response", () => {
		expect(buildRequestUserInputAnswer(baseQuestion, response())).toEqual({ answers: [] });
	});

	test("trims freeform text into a user note", () => {
		expect(buildRequestUserInputAnswer(baseQuestion, response({ customText: "  Ship in phases  " }))).toEqual({
			answers: ["user_note: Ship in phases"],
		});
	});

	test("returns the selected option label", () => {
		const question: NormalizedRequestUserInputQuestion = {
			...baseQuestion,
			options: [
				{ label: "Node", description: "Use Node" },
				{ label: "Bun", description: "Use Bun" },
			],
		};

		expect(
			buildRequestUserInputAnswer(question, response({ selectedOptionIndex: 1, selectionTouched: true })),
		).toEqual({ answers: ["Bun"] });
	});

	test("returns no answer for an invalid option index", () => {
		const question: NormalizedRequestUserInputQuestion = {
			...baseQuestion,
			options: [{ label: "Node", description: "Use Node" }],
		};

		expect(
			buildRequestUserInputAnswer(question, response({ selectedOptionIndex: 99, selectionTouched: true })),
		).toEqual({ answers: [] });
	});

	test("returns Other plus a user note for the freeform option", () => {
		const question: NormalizedRequestUserInputQuestion = {
			...baseQuestion,
			options: [{ label: "Node", description: "Use Node" }],
		};

		expect(
			buildRequestUserInputAnswer(
				question,
				response({ selectedOptionIndex: 1, customText: "  Bun  ", selectionTouched: true }),
			),
		).toEqual({ answers: ["Other", "user_note: Bun"] });
	});

	test("returns no answer when Other is selected without text", () => {
		const question: NormalizedRequestUserInputQuestion = {
			...baseQuestion,
			options: [{ label: "Node", description: "Use Node" }],
		};

		expect(
			buildRequestUserInputAnswer(question, response({ selectedOptionIndex: 1, selectionTouched: true })),
		).toEqual({ answers: [] });
	});
});

describe("buildRequestUserInputResponse", () => {
	test("preserves option, other, and note semantics", () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "Use Node.js" },
					{ label: "Bun", description: "Use Bun" },
				],
			},
			{
				id: "notes",
				header: "Notes",
				question: "Any constraints?",
			},
		]);

		const response = buildRequestUserInputResponse(questions, [
			{ selectedOptionIndex: 2, customText: "Need Bun APIs", selectionTouched: true, committed: true },
			{ selectedOptionIndex: 0, customText: "Ship in two phases", selectionTouched: true, committed: true },
		]);

		expect(response.answers["runtime"]?.answers).toEqual(["Other", "user_note: Need Bun APIs"]);
		expect(response.answers["notes"]?.answers).toEqual(["user_note: Ship in two phases"]);
	});

	test("preserves prototype-named ids through JSON serialization", () => {
		const questions = normalizeOrThrow(
			["__proto__", "constructor", "toString"].map((id) => ({
				id,
				header: "Notes",
				question: "Any constraints?",
			})),
		);
		const response = buildRequestUserInputResponse(
			questions,
			questions.map(() => ({
				selectedOptionIndex: 0,
				customText: "Ship in phases",
				selectionTouched: true,
				committed: true,
			})),
		);
		const restored: unknown = JSON.parse(JSON.stringify(response));

		expect(Object.hasOwn(response.answers, "__proto__")).toBe(true);
		expect(restored).toEqual({
			answers: {
				["__proto__"]: { answers: ["user_note: Ship in phases"] },
				constructor: { answers: ["user_note: Ship in phases"] },
				toString: { answers: ["user_note: Ship in phases"] },
			},
		});
	});

	test("rejects missing responses instead of silently dropping questions", () => {
		const questions = normalizeOrThrow([{ id: "notes", header: "Notes", question: "Any constraints?" }]);

		expect(() => buildRequestUserInputResponse(questions, [])).toThrow(
			"Missing response for request_user_input question: notes",
		);
	});
});

describe("collectRequestUserInputAnswers", () => {
	test("uses input for open-ended questions", async () => {
		const questions = normalizeOrThrow([{ id: "notes", header: "Notes", question: "Any constraints?" }]);
		const ctx = createCtx({ input: ["Ship in two phases"] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.input).toHaveBeenCalledWith("Notes\nAny constraints?", "Any constraints?");
		expect(ctx.ui.select).not.toHaveBeenCalled();
		expect(response?.answers["notes"]?.answers).toEqual(["user_note: Ship in two phases"]);
	});

	test("uses select for option questions and maps duplicate labels by prefix", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "First Node" },
					{ label: "Node", description: "Second Node" },
				],
			},
		]);
		const ctx = createCtx({ select: ["2. Node — Second Node"] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.select).toHaveBeenCalledWith("Runtime\nWhich runtime?", [
			"1. Node — First Node",
			"2. Node — Second Node",
			"3. Other (type your own answer)",
		]);
		expect(ctx.ui.input).not.toHaveBeenCalled();
		expect(response?.answers["runtime"]?.answers).toEqual(["Node"]);
	});

	test("shows option descriptions in the select list and returns the bare label", async () => {
		const questions = normalizeOrThrow([
			{
				id: "db",
				header: "Database",
				question: "Which database?",
				options: [
					{ label: "SQLite", description: "Zero setup; weaker under concurrent writes." },
					{ label: "Postgres", description: "Needs a server; production-grade." },
				],
			},
		]);
		const ctx = createCtx({ select: ["2. Postgres — Needs a server; production-grade."] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.select).toHaveBeenCalledWith("Database\nWhich database?", [
			"1. SQLite — Zero setup; weaker under concurrent writes.",
			"2. Postgres — Needs a server; production-grade.",
			"3. Other (type your own answer)",
		]);
		expect(response?.answers["db"]?.answers).toEqual(["Postgres"]);
	});

	test("omits the separator for blank descriptions and keeps each option on one line", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [
					{ label: "Node", description: "" },
					{ label: "Bun", description: "   " },
					{ label: "Deno", description: "  Secure by default;\n  built-in tooling.  " },
				],
			},
		]);
		const ctx = createCtx({ select: ["3. Deno — Secure by default; built-in tooling."] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.select).toHaveBeenCalledWith("Runtime\nWhich runtime?", [
			"1. Node",
			"2. Bun",
			"3. Deno — Secure by default; built-in tooling.",
			"4. Other (type your own answer)",
		]);
		expect(response?.answers["runtime"]?.answers).toEqual(["Deno"]);
	});

	test("advertises freeform input on the Other option and collects the follow-up answer", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ select: ["2. Other (type your own answer)"], input: ["Bun"] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.input).toHaveBeenCalledWith("Runtime\nWhich runtime?\nOther answer", "Type your answer");
		expect(response?.answers["runtime"]?.answers).toEqual(["Other", "user_note: Bun"]);
	});

	test("returns null when select is cancelled", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ select: [undefined] });

		await expect(collectRequestUserInputAnswers(ctx, questions)).resolves.toBeNull();
	});

	test("returns null when an open-ended input is cancelled", async () => {
		const questions = normalizeOrThrow([{ id: "notes", header: "Notes", question: "Any constraints?" }]);
		const ctx = createCtx({ input: [undefined] });

		await expect(collectRequestUserInputAnswers(ctx, questions)).resolves.toBeNull();
	});

	test("returns null when Other input is cancelled", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ select: ["2. Other (type your own answer)"], input: [undefined] });

		await expect(collectRequestUserInputAnswers(ctx, questions)).resolves.toBeNull();
	});

	test("returns null when the select result is not one of the offered labels", async () => {
		const questions = normalizeOrThrow([
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ select: ["unexpected"] });

		await expect(collectRequestUserInputAnswers(ctx, questions)).resolves.toBeNull();
	});

	test("asks multiple questions in order", async () => {
		const questions = normalizeOrThrow([
			{ id: "notes", header: "Notes", question: "Any constraints?" },
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ input: ["Fast"], select: ["1. Node — Use Node"] });

		const response = await collectRequestUserInputAnswers(ctx, questions);

		expect(ctx.ui.input).toHaveBeenNthCalledWith(1, "Notes\nAny constraints?", "Any constraints?");
		expect(ctx.ui.select).toHaveBeenNthCalledWith(1, "Runtime\nWhich runtime?", [
			"1. Node — Use Node",
			"2. Other (type your own answer)",
		]);
		expect(response?.answers["notes"]?.answers).toEqual(["user_note: Fast"]);
		expect(response?.answers["runtime"]?.answers).toEqual(["Node"]);
	});

	test("passes the abort signal to every built-in dialog", async () => {
		const questions = normalizeOrThrow([
			{ id: "notes", header: "Notes", question: "Any constraints?" },
			{
				id: "runtime",
				header: "Runtime",
				question: "Which runtime?",
				options: [{ label: "Node", description: "Use Node" }],
			},
		]);
		const ctx = createCtx({ input: ["Fast", "Bun"], select: ["2. Other (type your own answer)"] });
		const signal = new AbortController().signal;

		const response = await collectRequestUserInputAnswers(ctx, questions, signal);

		expect(ctx.ui.input).toHaveBeenNthCalledWith(1, "Notes\nAny constraints?", "Any constraints?", { signal });
		expect(ctx.ui.select).toHaveBeenNthCalledWith(
			1,
			"Runtime\nWhich runtime?",
			["1. Node — Use Node", "2. Other (type your own answer)"],
			{ signal },
		);
		expect(ctx.ui.input).toHaveBeenNthCalledWith(2, "Runtime\nWhich runtime?\nOther answer", "Type your answer", {
			signal,
		});
		expect(response?.answers["notes"]?.answers).toEqual(["user_note: Fast"]);
		expect(response?.answers["runtime"]?.answers).toEqual(["Other", "user_note: Bun"]);
	});
});

describe("request_user_input formatting helpers", () => {
	test("formats missing answers", () => {
		expect(summarizeRequestUserInputAnswer(undefined)).toBe("(no answer)");
		expect(summarizeRequestUserInputAnswer({ answers: [] })).toBe("(no answer)");
		expect(summarizeRequestUserInputAnswer({ answers: ["   "] })).toBe("(no answer)");
	});

	test("formats a note-only answer", () => {
		expect(summarizeRequestUserInputAnswer({ answers: ["user_note: Bun for startup"] })).toBe("Bun for startup");
	});

	test("formats a selected answer", () => {
		expect(summarizeRequestUserInputAnswer({ answers: ["Node", "Bun"] })).toBe("Node, Bun");
	});

	test("formats a selected answer with notes", () => {
		expect(summarizeRequestUserInputAnswer({ answers: ["Other", "user_note: Bun for startup"] })).toBe(
			"Other (Bun for startup)",
		);
	});

	test("builds readable summary lines", () => {
		const summary = buildRequestUserInputSummary({
			questions: [
				{ id: "runtime", header: "Runtime", question: "Which runtime?", options: [] },
				{ id: "notes", header: "Notes", question: "Any constraints?", options: [] },
			],
			response: {
				answers: {
					runtime: { answers: ["Node"] },
					notes: { answers: ["user_note: Ship in two phases"] },
				},
			},
		});

		expect(summary).toBe(
			"1. Which runtime?\n   Answer: Node\n2. Any constraints?\n   Answer: Ship in two phases",
		);
	});

	test("builds a header and prompt title", () => {
		const question: NormalizedRequestUserInputQuestion = {
			id: "runtime",
			header: "Runtime",
			question: "Which runtime?",
			options: [],
		};

		expect(buildRequestUserInputDialogTitle(question)).toBe("Runtime\nWhich runtime?");
	});

	test("does not duplicate a header that equals the prompt", () => {
		const question: NormalizedRequestUserInputQuestion = {
			id: "runtime",
			header: "Which runtime?",
			question: "Which runtime?",
			options: [],
		};

		expect(buildRequestUserInputDialogTitle(question)).toBe("Which runtime?");
	});

	test("falls back to the prompt when the header is blank", () => {
		const question: NormalizedRequestUserInputQuestion = {
			id: "runtime",
			header: "   ",
			question: "Which runtime?",
			options: [],
		};

		expect(buildRequestUserInputDialogTitle(question)).toBe("Which runtime?");
	});
});
