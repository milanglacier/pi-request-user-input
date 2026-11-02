import { describe, expect, test } from "vitest";
import { type JsonObject, validateToolArguments } from "@earendil-works/pi-ai";

import { createRequestUserInputTool } from "../src/request-user-input";

const tool = createRequestUserInputTool();

/** Runs Pi's own argument validation, which every call passes before `execute()`. */
function validate(args: JsonObject): { ok: true; value: unknown } | { ok: false; error: string } {
	try {
		const value: unknown = validateToolArguments(tool, {
			type: "toolCall",
			id: "call-1",
			name: tool.name,
			arguments: args,
		});
		return { ok: true, value };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

const question = { id: "notes", header: "Notes", question: "Any constraints?" };

describe("RequestUserInputSchema under Pi's validation", () => {
	test("accepts open-ended and multiple-choice questions", () => {
		const args = {
			questions: [
				question,
				{
					id: "runtime",
					header: "Runtime",
					question: "Which runtime?",
					options: [{ label: "Node", description: "Use Node" }],
				},
			],
		};

		expect(validate(args)).toEqual({ ok: true, value: args });
	});

	test("rejects an empty question list", () => {
		expect(validate({ questions: [] })).toMatchObject({ ok: false, error: expect.stringContaining("questions") });
	});

	test("rejects more than three questions", () => {
		const questions = Array.from({ length: 4 }, (_, index) => ({ ...question, id: `q${index}` }));

		expect(validate({ questions })).toMatchObject({ ok: false, error: expect.stringContaining("questions") });
	});

	test("rejects unknown properties and missing required fields", () => {
		expect(validate({ questions: [{ ...question, extra: true }] })).toMatchObject({
			ok: false,
			error: expect.stringContaining("questions.0.extra"),
		});
		expect(validate({ questions: [{ id: "notes", question: "Any constraints?" }] })).toMatchObject({
			ok: false,
			error: expect.stringContaining("questions.0.header"),
		});
	});

	test("hands the tool a question list when the model sends one question object", () => {
		expect(validate({ questions: question })).toEqual({ ok: true, value: { questions: [question] } });
	});
});
