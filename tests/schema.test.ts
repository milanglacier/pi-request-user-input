import { describe, expect, test } from "vitest";
import { Value } from "typebox/value";

import { RequestUserInputSchema } from "../src/schemas";

describe("RequestUserInputSchema", () => {
	test("accepts open-ended and multiple-choice questions", () => {
		expect(
			Value.Check(RequestUserInputSchema, {
				questions: [
					{ id: "notes", header: "Notes", question: "Any constraints?" },
					{
						id: "runtime",
						header: "Runtime",
						question: "Which runtime?",
						options: [{ label: "Node", description: "Use Node" }],
					},
				],
			}),
		).toBe(true);
	});

	test("rejects an empty question list", () => {
		expect(Value.Check(RequestUserInputSchema, { questions: [] })).toBe(false);
	});

	test("rejects more than three questions", () => {
		const questions = Array.from({ length: 4 }, (_, index) => ({
			id: `q${index}`,
			header: "Q",
			question: `Question ${index}`,
		}));

		expect(Value.Check(RequestUserInputSchema, { questions })).toBe(false);
	});

	test("rejects unknown properties and missing required fields", () => {
		expect(
			Value.Check(RequestUserInputSchema, {
				questions: [{ id: "notes", header: "Notes", question: "Any constraints?", extra: true }],
			}),
		).toBe(false);
		expect(Value.Check(RequestUserInputSchema, { questions: [{ id: "notes", question: "Any constraints?" }] })).toBe(
			false,
		);
	});
});
