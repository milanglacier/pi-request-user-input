# pi-request-user-input

Standalone Pi extension that registers the `request_user_input` tool. Keep the
package focused on asking the user short questions; do not add unrelated
commands, session persistence, or other agent behavior. The only command and
flag control whether the tool is enabled.

## Tool contract

- The model supplies one to three questions. Every question must have a unique
  non-empty `id`; `options` is optional and may be empty.
- Questions with options use `ctx.ui.select`; open-ended questions and the
  `Other` branch use `ctx.ui.input`.
- The tool requires UI support. Keep the `ctx.hasUI` guard and pass the tool's
  abort signal to every dialog. Pi assumes that RPC mode has a UI, but some
  setups run Pi in RPC mode without one. `PI_REQUEST_USER_INPUT_NONINTERACTIVE=1`
  makes the tool fail as if no UI were available in those setups.
- Return answers in both the model-facing summary (`content`) and
  `details.response`; keep the answer map keyed by question id.
- The tool is registered with `exposure: "model-only"` and
  `annotations.readOnlyHint: true`. Change either only for a concrete reason.
- `src/schemas.ts` is the model-facing input contract. Update it together with
  the README when the tool input changes.

## Enabling and disabling

- `src/settings.ts` resolves whether the tool is enabled. Precedence: the
  `--request-user-input on|off` flag, then `.pi/request-user-input.json` in the
  cwd (only when the project is trusted), then
  `getAgentDir()/request-user-input.json`, then the default (enabled).
- `src/toggle.ts` registers the flag and the `/request-user-input
  [on|off|toggle]` command. The tool is always registered; enabling and
  disabling add it to or remove it from the active tool set. Every
  `session_start` applies the resolved setting again.
- Report bad config or flag values with `ctx.ui.notify` warnings, never by
  throwing, so a typo does not stop Pi from starting.

## Types and checks

- Use the real Pi types from `@earendil-works/pi-*`. Do not add local SDK shims,
  broad casts, or `any` to make the typecheck pass.
- Keep `tsconfig.json` strict. Run `npm run check` before committing.
- Tests use the real Pi context contract through `test-utils/context.ts`. Add
  behavior tests in `tests/` for every user-visible change.

## Packaging

- `index.ts` is the extension entry point and only wires the tool and the
  toggle. Put implementation in `src/`.
- The package ships raw TypeScript, which Pi loads through `pi.extensions`.
- Keep the published `files` list limited to runtime sources and documentation.

## Commits

Use Conventional Commits. This repository is also checked out on its own,
outside the parent monorepo.
