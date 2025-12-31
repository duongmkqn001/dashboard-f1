# Simple HTTP Server for Testing Dashboard
# Run this in PowerShell: .\start-server.ps1

$port = 8000
$path = Get-Location

Write-Host "🚀 Starting local web server..." -ForegroundColor Green
Write-Host "📂 Serving files from: $path" -ForegroundColor Cyan
Write-Host "🌐 Server running at: http://localhost:$port" -ForegroundColor Yellow
Write-Host ""
Write-Host "✨ Open your browser and go to:" -ForegroundColor Green
Write-Host "   http://localhost:$port/dashboard-v2.html" -ForegroundColor White -BackgroundColor Blue
Write-Host ""
Write-Host "Press Ctrl+C to stop the server..." -ForegroundColor Yellow
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Get requested file path
        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ($urlPath -eq '' -or $urlPath -eq '/') {
            $urlPath = 'dashboard-v2.html'
        }
        
        $filePath = Join-Path $path $urlPath
        
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - GET $urlPath" -ForegroundColor Gray
        
        if (Test-Path $filePath -PathType Leaf) {
            # Set content type based on file extension
            $extension = [System.IO.Path]::GetExtension($filePath)
            $contentType = switch ($extension) {
                '.html' { 'text/html' }
                '.css'  { 'text/css' }
                '.js'   { 'application/javascript' }
                '.json' { 'application/json' }
                '.png'  { 'image/png' }
                '.jpg'  { 'image/jpeg' }
                '.jpeg' { 'image/jpeg' }
                '.gif'  { 'image/gif' }
                '.svg'  { 'image/svg+xml' }
                '.ico'  { 'image/x-icon' }
                default { 'application/octet-stream' }
            }
            
            $response.ContentType = $contentType
            $response.StatusCode = 200
            
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        else {
            $response.StatusCode = 404
            $message = "404 - File not found: $urlPath"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($message)
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            Write-Host "  ❌ File not found: $filePath" -ForegroundColor Red
        }
        
        $response.Close()
    }
}
finally {
    $listener.Stop()
    Write-Host "`n✅ Server stopped." -ForegroundColor Green
}
