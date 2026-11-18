---
"@ai-sdk/harness-pi": patch
---

Keep deferred MCP tools that `tool_search` loaded in an earlier turn active when a session resumes from a session storage. Pi's startup wait only covers MCP servers with `direct` tools, so the resumed session's first request was prepared before those tools registered, and Pi recorded them as removed. The harness now waits (up to 10 seconds, or until the turn is aborted) for the restored tools of configured MCP servers to register, then activates them again.
