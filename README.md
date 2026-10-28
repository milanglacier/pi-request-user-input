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
  `Other (type your own answer)` entry. Each option shows its label and
  description on one line, such as `1. Node — Use Node.js APIs and tooling.`
  The answer returned to the model contains only the label. Choosing `Other`
  opens a follow-up text input.
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

## Enabling and disabling the tool

The tool is enabled by default. When it is disabled, Pi does not declare it to
the model, so the model cannot call it.

### Config file

Set `enabled` in `request-user-input.json`:

```json
{
  "enabled": false
}
```

Pi reads the file from two places:

- **Global:** `~/.pi/agent/request-user-input.json`, or
  `$PI_CODING_AGENT_DIR/request-user-input.json` when that variable is set.
- **Project:** `.pi/request-user-input.json` in the working directory. Pi reads
  it only when the project is trusted.

The project file overrides the global file. A missing file is ignored. If a file
is malformed or `enabled` is not a boolean, pi shows a warning and ignores that
file.

### CLI flag

`--request-user-input on|off` overrides both config files for the session:

```bash
pi --request-user-input off
```

### Slash command

`/request-user-input [on|off|toggle]` enables, disables, or toggles the tool in
the running session. Without an argument, it toggles. The change applies until
the next session start, such as `/new`, `/resume`, or `/reload`. At each
session start, the extension applies the CLI flag and config files again.

If `--tools` leaves `request_user_input` out, the tool is not available in the
session, and `/request-user-input on` shows a warning.

## Requirements

- Pi with extension UI dialog support (`ctx.ui.input` and `ctx.ui.select`).
- The tool fails with a clear error when the session has no UI support.

Pi assumes that RPC mode (`--mode rpc`) has a UI, but some setups run Pi in
RPC mode without one, such as a script that drives Pi. In that case, set
`PI_REQUEST_USER_INPUT_NONINTERACTIVE=1`. The tool then fails as if no UI were
available, and the error tells the model to continue without asking.

## Development

```bash
npm install
npm run check
```

`npm run check` runs the strict TypeScript type check and the full Vitest
suite. Integration tests load the extension through Pi and exercise its session
lifecycle, tool activation, and commands without model calls. Rendering tests use
Pi's tool-rendering component; focused unit tests use SDK-checked dialog doubles.
