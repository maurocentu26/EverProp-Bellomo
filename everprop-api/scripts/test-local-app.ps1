param([string]$BaseUrl = 'http://localhost:3000')
$ErrorActionPreference = 'Stop'
foreach ($email in @('admin@bellomo.com', 'sofia@bellomo.com', 'lucas.albarracin@bellomo.com', 'valentina.morales@bellomo.com')) {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $headers = @{Accept='application/json'; Origin=$BaseUrl; Referer="$BaseUrl/login"; 'X-Everprop-Tenant'='bellomo'}
    $null = Invoke-WebRequest "$BaseUrl/sanctum/csrf-cookie" -WebSession $session -Headers $headers -UseBasicParsing -TimeoutSec 30
    $headers['X-XSRF-TOKEN'] = [uri]::UnescapeDataString($session.Cookies.GetCookies($BaseUrl)['XSRF-TOKEN'].Value)
    $body = @{email=$email; password='password123'} | ConvertTo-Json
    $null = Invoke-WebRequest "$BaseUrl/api/v1/auth/login" -Method Post -ContentType 'application/json' -Body $body -WebSession $session -Headers $headers -UseBasicParsing -TimeoutSec 30
    foreach ($path in @('auth/me', 'admin/projects', 'admin/properties', 'admin/leads', 'admin/follow-ups', 'admin/notifications', 'admin/payment-agreements', 'admin/installments', 'admin/collections/summary')) {
        $response = Invoke-WebRequest "$BaseUrl/api/v1/$path" -WebSession $session -Headers $headers -UseBasicParsing -TimeoutSec 30
        if ($response.StatusCode -ne 200) { throw "$email $path failed" }
    }
    Write-Output "$email : login and 9 module endpoints OK"
}
