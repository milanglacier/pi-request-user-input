# Changelog

## Unreleased

- Preserves answers for question IDs such as `__proto__` when tool results are serialized.
- Adds `request-user-input.json` with an `enabled` setting, read from the global agent directory and the trusted project's `.pi` directory. The project file overrides the global one. The tool is enabled by default.
- Adds the `--request-user-input on|off` CLI flag, which overrides the config files.
- Adds the `/request-user-input [on|off|toggle]` command, which enables, disables, or toggles the tool in the running session.
- Adds `PI_REQUEST_USER_INPUT_NONINTERACTIVE=1`, which makes the tool fail as if no UI were available. Use it when Pi runs in RPC mode without a UI.

## 0.1.0

- Initial release.
- Adds the `request_user_input` tool for asking one to three short questions with optional multiple-choice answers and freeform "Other" responses.
