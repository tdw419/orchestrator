# Desktop Driver API Specification

A standalone HTTP service for OS-level automation (screenshots, mouse, keyboard, window control). This replaces the unreachable desktop driver and provides robust OS integration.

## Endpoints

### Core Automation
- `POST /computer-use` - Execute automation action
- `GET /health` - Health check

### Actions

```typescript
interface AutomationAction {
  action: 'screenshot' | 'move_mouse' | 'click_mouse' | 'scroll' | 'type_text' | 'key_press' | 'open_app';
  params?: {
    // Mouse actions
    x?: number;
    y?: number;
    button?: 'left' | 'right' | 'middle';
    
    // Keyboard actions
    text?: string;
    key?: string;
    modifiers?: string[];
    
    // App launching
    app?: string;
    args?: string[];
    
    // Scrolling
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
  };
}
```

### Response Format

```typescript
interface AutomationResponse {
  status: number;
  data: {
    ok: boolean;
    image_base64?: string; // For screenshot
    error?: string;
    [key: string]: any;
  };
}
```

## Implementation Options

### Option 1: Go (Recommended)
- Single binary, no dependencies
- Cross-platform with OS-specific implementations
- Fast startup, low memory footprint
- Good for screenshots via system APIs

### Option 2: C# (.NET)
- Best Windows integration (UIA, Win32 APIs)
- Native Windows service support
- Excellent for complex UI automation
- Windows-specific but powerful

### Option 3: Rust
- Maximum performance and reliability
- Safe systems programming
- Cross-platform capabilities
- Steeper learning curve

## Sample Go Implementation Structure

```go
package main

import (
    "encoding/json"
    "net/http"
    "github.com/go-vgo/robotgo"
)

type Action struct {
    Action string                 `json:"action"`
    Params map[string]interface{} `json:"params,omitempty"`
}

func handleComputerUse(w http.ResponseWriter, r *http.Request) {
    var action Action
    json.NewDecoder(r.Body).Decode(&action)
    
    switch action.Action {
    case "screenshot":
        bitmap := robotgo.CaptureScreen()
        // Convert to base64...
    case "click_mouse":
        robotgo.Click(int(params["x"]), int(params["y"]))
    // ... other actions
    }
}
```

## Deployment

1. **Development**: Run on port 39990 (matches current DESKTOP_DRIVER_URL)
2. **Production**: Windows service with proper error handling
3. **Security**: Localhost-only binding, optional API key auth

## Integration

The TypeScript orchestrator calls this service via HTTP:
```typescript
const resp = await fetch(config.desktopDriverUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'screenshot', params: {} })
});
```

## Next Steps

1. Choose implementation language (Go recommended)
2. Implement core actions (screenshot, click, type)
3. Add Windows service wrapper
4. Test with orchestrator integration