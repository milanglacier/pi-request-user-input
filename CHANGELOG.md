# Changelog

## [0.2.0] - 2026-10-28

### Added

- `request-user-input.json` in the global agent directory or the trusted project's `.pi` directory enables or disables the tool. The project file overrides the global one.
- The `--request-user-input on|off` flag overrides the config files.
- The `/request-user-input [on|off|toggle]` command switches the tool in the running session.
- `PI_REQUEST_USER_INPUT_NONINTERACTIVE=1` makes the tool fail as if no UI were available, for RPC hosts without a UI.
- The select dialog shows option descriptions.

### Fixed

- Answers to questions with IDs such as `__proto__` are kept when tool results are saved.

## [0.1.0] - 2026-10-23

### Added

- Initial release. The `request_user_input` tool asks one to three short questions with optional multiple-choice answers and a freeform "Other" answer.
