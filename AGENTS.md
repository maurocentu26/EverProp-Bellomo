# Local Docker Desktop launch

On this Windows computer, launch Docker Desktop through its installed Start Menu shortcut:
`C:\Users\PC\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Docker Desktop.lnk`.

Verified on 2026-09-15: the shortcut targets
`C:\Users\PC\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe`
with working directory
`C:\Users\PC\AppData\Local\Programs\DockerDesktop\frontend`.
Prefer the shortcut so its configured launch settings are respected. Recheck the shortcut if the installation changes.

A successful Start-Process call only confirms launch was requested. Check Docker processes and `docker info` before reporting that Docker is running or ready. Previous startup failures involved inaccessible socket files; do not mistake those for an executable-path error.
