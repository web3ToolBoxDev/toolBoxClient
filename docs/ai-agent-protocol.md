# AI Agent WebSocket Protocol (v1)

This protocol defines the generic interaction contract between:

- Frontend workspace (`client/src/pages/agentWorkspace`)
- Agent module script (example: `example/ai_example.js`)

Goal: any agent module can be plugged in with the same UI/runtime behavior.

## Envelope

All messages should use this envelope:

```json
{
  "type": "message_type",
  "taskName": "任务名",
  "payload": {}
}
```

Module state/event messages may use:

```json
{
  "type": "event_type",
  "version": "1.0",
  "taskName": "任务名",
  "timestamp": 1770000000000,
  "data": {}
}
```

## Frontend -> Agent Commands

`language` is recommended on all command payloads (not only `agent_init`) so module responses can stay synchronized with UI locale.

### `agent_init`

Initialize module runtime/UI language.

```json
{
  "type": "agent_init",
  "taskName": "求职AI助手",
  "payload": {
    "language": "en",
    "model": "gpt-4o-mini"
  }
}
```

### `agent_session_create`

Create a new session.

```json
{
  "type": "agent_session_create",
  "taskName": "求职AI助手",
  "payload": {
    "name": "Backend Track",
    "language": "en"
  }
}
```

### `agent_session_delete`

Delete an existing session.

```json
{
  "type": "agent_session_delete",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx"
  }
}
```

### `agent_session_switch`

Switch active session.

```json
{
  "type": "agent_session_switch",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx"
  }
}
```

### `agent_session_context_update`

Bind runtime context to a session.

```json
{
  "type": "agent_session_context_update",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "runtimeContext": {
      "mode": "env",
      "envIds": ["env-1"],
      "walletIds": [],
      "model": "gpt-4o-mini"
    }
  }
}
```

### `agent_user_input`

Free text user input.

```json
{
  "type": "agent_user_input",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "text": "Start resume search",
    "runtimeContext": {}
  }
}
```

### `agent_user_option`

User selects a structured option provided by the module.

```json
{
  "type": "agent_user_option",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "questionId": "q_track",
    "questionText": "Choose your primary job track",
    "optionId": "track_backend",
    "optionLabel": "Backend Engineer",
    "runtimeContext": {}
  }
}
```

### `agent_user_answer`

User submits a structured free-form answer for a question (text/number/date).

```json
{
  "type": "agent_user_answer",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "questionId": "q_salary",
    "questionText": "Input target monthly salary (K)",
    "answer": "30",
    "runtimeContext": {}
  }
}
```

### `agent_user_attachment`

User sends file/image attachment (upload or paste).

```json
{
  "type": "agent_user_attachment",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "runtimeContext": {},
    "attachments": [
      {
        "id": "att_001",
        "name": "resume.pdf",
        "mimeType": "application/pdf",
        "size": 58231,
        "source": "upload",
        "questionId": "q_upload_profile",
        "questionText": "Upload resume or portfolio (optional)",
        "contentBase64": "JVBERi0xLjcK..."
      }
    ],
    "rejected": [
      {
        "name": "large.mov",
        "reason": "size",
        "size": 10500000,
        "source": "upload",
        "questionId": "q_upload_profile"
      },
      {
        "name": "unknown.bin",
        "reason": "type",
        "kind": "file",
        "source": "paste"
      }
    ]
  }
}
```

`source` recommended values:

- `upload`
- `paste`
- `drag`

`rejected[]` is optional and allows frontend to report local filtering failures (type/size) back to module for conversation/log feedback.

### `agent_execution_control`

Control running session execution.

```json
{
  "type": "agent_execution_control",
  "taskName": "求职AI助手",
  "payload": {
    "sessionId": "session_xxx",
    "action": "pause"
  }
}
```

Supported actions:

- `pause`
- `resume`
- `retry`
- `cancel`

## Prompt Extension (Agent -> Frontend)

`agent_conversation_update.data.prompt` may include attachment policy for the current session:

```json
{
  "text": "Prompt text",
  "attachmentPolicy": {
    "maxSizeMB": 4,
    "allowedKinds": ["image", "pdf", "sheet", "text"]
  },
  "questions": []
}
```

`allowedKinds` optional values:

- `image`
- `pdf`
- `sheet`
- `text`
- `file`

## Agent -> Frontend Events

### `agent_state_snapshot`

Full state sync (authoritative). Includes:

- `sessions`
- `activeSessionId`
- `conversations`
- `subtasks`
- `artifacts`
- `runtimeLogs`
- `prompts`
- `runtimeContexts`

### `agent_session_list`

Incremental session list refresh:

- `sessions`
- `activeSessionId`

### `agent_conversation_update`

Append conversation messages and optional prompt.

```json
{
  "type": "agent_conversation_update",
  "data": {
    "sessionId": "session_xxx",
    "append": [
      {
        "id": "msg_1",
        "role": "assistant",
        "content": "Please choose an option",
        "createdAt": 1770000000000,
        "questionId": "q_execute_mode",
        "questionText": "Choose execution mode",
        "selectedOptionId": "",
        "options": [
          { "id": "exec_now", "label": "Run now" },
          { "id": "exec_schedule", "label": "Schedule" }
        ],
        "attachments": [
          {
            "name": "portfolio.pdf",
            "mimeType": "application/pdf",
            "size": 58231,
            "contentBase64": "JVBERi0xLjcK..."
          }
        ]
      }
    ],
    "prompt": {
      "text": "Select preset questions and answer",
      "questions": [
        {
          "id": "q_track",
          "text": "Choose your primary job track",
          "selectedOptionId": "",
          "options": [
            { "id": "track_frontend", "label": "Frontend Engineer" }
          ]
        },
        {
          "id": "q_salary",
          "type": "input",
          "inputType": "number",
          "text": "Input target monthly salary (K)",
          "placeholder": "e.g. 30",
          "answerValue": ""
        }
      ]
    }
  }
}
```

`append[].options` is optional and enables inline chat choices. Frontend should render these as clickable buttons and send result via `agent_user_option`.
`append[].attachments` is optional and enables inline attachment preview in conversation.
`append[]` may also carry inline upload request fields:

- `questionType: "upload"`
- `questionId`
- `questionText`
- optional `buttonLabel/allowMultiple/acceptKinds/maxSizeMB/uploadMode`

`uploadMode` optional values:

- `upload` (default): open file picker
- `paste`: do not open picker, user pastes file/image in chat input (`Ctrl+V`)

### `agent_subtask_update`

Runtime status updates for log panel:

- `sessionId`
- `items[]` each with `key/status/updatedAt`

### `agent_artifact_update`

Generated output updates:

- `sessionId`
- `append[]` each with `id/type/title/filePath/relativePath`

### `agent_runtime_log_update`

Incremental runtime log updates (independent from conversation):

- `sessionId`
- `append[]` each with `id/time/text`
- optional fields:
  - `level`: `info | warn | error | debug`
  - `source`: e.g. `system | user | subtask | execution | artifact | attachment | context`

### `agent_execution_update`

Execution runtime state for one session.

```json
{
  "type": "agent_execution_update",
  "data": {
    "sessionId": "session_xxx",
    "state": {
      "paused": false,
      "canceled": false
    }
  }
}
```

### `agent_error`

Recoverable module-level errors:

- `code`
- `message`

## Status Mapping

Recommended `status` values:

- `pending`
- `running`
- `review`
- `done`
- `failed`

## Notes

- UI should remain transport-agnostic; module owns business logic and prompt generation.
- Runtime model selection is carried by `payload.model` and/or `runtimeContext.model`; module should treat them as user-selected model hints.
- `prompt.questions` is the preferred option schema.
- `prompt.questions` supports both:
  - choice question: `options[]` + `selectedOptionId`
  - input question: `type/inputType/placeholder` + `answerValue`
- upload question: `type: "upload"` + optional `buttonLabel/allowMultiple/uploaded/acceptKinds/maxSizeMB`
- upload question also supports optional `uploadMode`:
  - `upload` (default)
  - `paste` (arm paste and auto-dispatch on next clipboard file paste)
- module may append dynamic questions at runtime (example: `q_attachment_action` after attachments are uploaded)
- Frontend should not hardcode business-specific questions/options.
- `agent_user_attachment` size limits are frontend-enforced per file (current default: 4MB); modules should still validate server-side.
