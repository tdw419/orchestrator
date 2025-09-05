# This script demonstrates how to use the orchestrator's API to run an end-to-end LLM pipeline test.

param(
    [string]$OrchestratorUrl = "http://localhost:4100"
)

function Test-WebSocketConnection ($url) {
    try {
        $uri = New-Object System.Uri($url)
        $client = New-Object System.Net.WebSockets.ClientWebSocket
        
        # Use a timeout for connection attempt
        $connectTask = $client.ConnectAsync($uri, [System.Threading.CancellationToken]::None)
        $connectTask.Wait(2000) | Out-Null # Wait for 2 seconds, suppress output

        if ($connectTask.IsCompleted -and -not $connectTask.IsFaulted -and -not $connectTask.IsCanceled) {
            # Connection was successful
            $client.Dispose()
            return $true
        } else {
            # Connection failed or timed out
            $client.Dispose()
            return $false
        }
    } catch {
        # Catch any exceptions during connection attempt (e.g., ECONNREFUSED)
        return $false
    }
}

$BevyWebSocketUrl = "ws://127.0.0.1:7878"
$EchoWebSocketUrl = "ws://127.0.0.1:7879"

$WebSocketUrl = $BevyWebSocketUrl
$ServerType = "Bevy"

Write-Host "Attempting to connect to Bevy WebSocket server at $BevyWebSocketUrl..."
if (-not (Test-WebSocketConnection $BevyWebSocketUrl)) {
    Write-Host "Bevy server not reachable. Falling back to local echo server at $EchoWebSocketUrl."
    $WebSocketUrl = $EchoWebSocketUrl
    $ServerType = "Echo"
} else {
    Write-Host "Successfully connected to Bevy server."
}
Write-Host "Using $ServerType server for WebSocket commands."

function New-Task ($goal) {
    $body = @{ goal = $goal } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$OrchestratorUrl/tasks" -Method Post -ContentType "application/json" -Body $body
    return $response.id
}

function Add-TaskAction ($taskId, $action, $command = $null) {
    $body = @{ action = $action }
    if ($command) { $body.command = $command }
    
    # Add WebSocket URL to ws_send actions
    if ($action -eq "ws_send") {
        $body.url = $WebSocketUrl
    }

    $jsonBody = ($body | ConvertTo-Json -Depth 10)
    try {
        $response = Invoke-RestMethod -Uri "$OrchestratorUrl/tasks/$taskId/actions" -Method POST -ContentType "application/json" -Body $jsonBody -ErrorAction Stop
        Write-Host "Added $action action. Response: $($response | ConvertTo-Json -Compress)"
    } catch {
        Write-Host "ERROR adding $action action: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "Error response body: $responseBody"
            } catch {
                Write-Host "Could not read error response"
            }
        }
    }
}

# 1. Create a new task
$taskId = New-Task "Run LLM Pipeline Smoke Test ($ServerType Server)"
Write-Host "Created task with ID: $taskId"

# 2. Ingest some sample GeoJSON features
$geojson = @{
    type = "FeatureCollection"
    features = @(
        @{
            type = "Feature"
            geometry = @{ type = "Point"; coordinates = @(-73.9851, 40.7589) }
            properties = @{
                name = "Times Square"
                feature_type = "poi"
                confidence = 0.95
                admin = "New York, NY, USA"
                source_id = "ts_1"
                text_excerpt = "Bustling tourist destination"
                uncertainty = 25.0
            }
        },
        @{
            type = "Feature"
            geometry = @{ type = "Point"; coordinates = @(-73.968285, 40.785091) }
            properties = @{
                name = "Central Park"
                feature_type = "place"
                confidence = 0.9
                admin = "New York, NY, USA"
                source_id = "cp_1"
                text_excerpt = "Large urban park with recreation"
                uncertainty = 50.0
            }
        }
    )
} | ConvertTo-Json -Compress

Add-TaskAction $taskId "ws_send" @{
    command = "ingest_llm_data"
    text = $geojson
}
Write-Host "Added ingest_llm_data action."

# 3. Cluster the features
Add-TaskAction $taskId "ws_send" @{
    command = "self_organize_features"
    method = "cluster"
}
Write-Host "Added self_organize_features (cluster) action."

# 4. Save features to database
Add-TaskAction $taskId "ws_send" @{
    command = "save_features_to_db"
    db_path = "test_llm_features.db"
}
Write-Host "Added save_features_to_db action."

# 5. Clear in-memory features (simulate restart or new session)
Add-TaskAction $taskId "ws_send" @{
    command = "ingest_llm_data"
    text = (@{ type = "FeatureCollection"; features = @() } | ConvertTo-Json -Compress)
}
Write-Host "Added action to clear in-memory features."

# 6. Load features from database
Add-TaskAction $taskId "ws_send" @{
    command = "load_features_from_db"
    db_path = "test_llm_features.db"
}
Write-Host "Added load_features_from_db action."

# 7. Get all LLM features and verify
Add-TaskAction $taskId "ws_send" @{
    command = "get_llm_features"
}
Write-Host "Added get_llm_features action."

Write-Host "Script finished. Check orchestrator UI at $OrchestratorUrl to see task progress."
