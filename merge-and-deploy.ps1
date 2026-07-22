# ============================================================================
# Don dep untracked scripts + merge feature branch -> main + push
# Chay trong PowerShell tai G:\web\dashboard-f1
# ============================================================================

$ErrorActionPreference = 'Stop'
Set-Location 'G:\web\dashboard-f1'

Write-Host "=== [1/5] Kiem tra trang thai ===" -ForegroundColor Cyan

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne 'cursor/durable-tickets-import-queue') {
    Write-Host "Sai branch: $currentBranch. Can o cursor/durable-tickets-import-queue" -ForegroundColor Red
    exit 1
}

$stashList = git stash list
if ($stashList -match 'wip: keep unstaged for later') {
    Write-Host "Stash ton tai: OK" -ForegroundColor Green
} else {
    Write-Host "Canh bao: khong thay stash 'wip: keep unstaged for later'" -ForegroundColor Yellow
}

Write-Host "`n=== [2/5] Don untracked scripts ra ngoai repo ===" -ForegroundColor Cyan

$wipDir = 'G:\web\dashboard-f1-wip'
if (-not (Test-Path $wipDir)) {
    New-Item -ItemType Directory -Path $wipDir | Out-Null
    Write-Host "Tao folder: $wipDir"
}

$untracked = @(
    'COMMIT_INSTRUCTIONS.md',
    'DEPLOY_QUEUE.cmd',
    'commit-and-push.cmd',
    'commit-staged-and-push.cmd',
    'deploy-edge-function.ps1',
    'git-status-check.cmd',
    'push-only.cmd',
    'set-git-identity.cmd',
    'sql\test_queue_after_migration.sql'
)

foreach ($f in $untracked) {
    if (Test-Path $f) {
        Move-Item -Path $f -Destination $wipDir -Force
        Write-Host "  Moved: $f"
    }
}

# supabase/.temp/ - xoa luon (CLI cache, tao lai duoc)
if (Test-Path 'supabase\.temp') {
    Remove-Item -Path 'supabase\.temp' -Recurse -Force
    Write-Host "  Removed: supabase\.temp\"
}

Write-Host "`n=== [3/5] Verify working tree clean (stash khong dem) ===" -ForegroundColor Cyan
git status --short
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git status that bai" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== [4/5] Switch sang main + merge feature branch ===" -ForegroundColor Cyan

git checkout main
if ($LASTEXITCODE -ne 0) { Write-Host "checkout main that bai" -ForegroundColor Red; exit 1 }

# Pull moi nhat tu origin main (de tranh non-fast-forward)
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "pull --ff-only that bai (co the remote main dang moi hon hoac conflict)" -ForegroundColor Red
    exit 1
}

# Merge feature vao main (fast-forward neu khong co commit moi tren main)
git merge --ff-only cursor/durable-tickets-import-queue
if ($LASTEXITCODE -ne 0) {
    Write-Host "merge --ff-only that bai. Co the main da co commit moi. Can dung merge khong ff:" -ForegroundColor Yellow
    Write-Host "  git merge cursor/durable-tickets-import-queue  (tao merge commit)"
    exit 1
}

Write-Host "Merge thanh cong (fast-forward)" -ForegroundColor Green

Write-Host "`n=== [5/5] Push main len origin (trigger GitHub Pages deploy) ===" -ForegroundColor Cyan

git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push main that bai" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== HOAN TAT ===" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Pages se deploy trong 1-2 phut."
Write-Host "Kiem tra tai: https://github.com/duongmkqn001/dashboard-f1/actions"
Write-Host "URL app:      https://duongmkqn001.github.io/dashboard-f1/dashboard-v2.html"
Write-Host ""
Write-Host "Sau khi deploy, hard-refresh trinh duyet (Ctrl+Shift+R) de load code moi."