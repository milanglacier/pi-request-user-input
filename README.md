# `@milanglacier/pi-request-user-input`

> Let the model ask you one to three short questions.

This extension registers the `request_user_input` tool. It gives the model a
structured way to ask clarifying questions and wait for your answers before
continuing.

## Installation

```bash
pi install npm:@milanglacier/pi-request-user-input
```

Or install directly from git:

```bash
pi install git:github.com/milanglacier/pi-request-user-input
```

## How it works

The model can call `request_user_input` with one to three questions. Each
question can be open-ended or include multiple-choice options:

- **Open-ended:** pi shows a text input dialog.
- **With options:** pi shows a select dialog with numbered options and an
  `Other (type your own answer)` entry. Choosing `Other` opens a follow-up
  text input.
- **Cancellation:** cancelling a dialog cancels the whole tool call.

Answers are returned to the model in a readable summary and in the tool result's
structured details. Every question must have a unique non-empty `id`, which is
used as the key in the answer map.

## Tool example

```json
{
  "questions": [
    {
      "id": "runtime",
      "header": "Runtime",
      "question": "Which runtime should the new package target?",
      "options": [
        { "label": "Node", "description": "Use Node.js APIs and tooling." },
        { "label": "Bun", "description": "Use Bun-specific APIs and tooling." }
      ]
    }
  ]
}
```

A typical response is:

```text
1. Which runtime should the new package target?
   Answer: Node
```

## Requirements

- Pi with extension UI dialog support (`ctx.ui.input` and `ctx.ui.select`).
- The tool fails with a clear error when the session has no UI support.

## Development

```bash
npm install
npm run check
```

`npm run check` runs the strict TypeScript type check and the full Vitest
suite.
