<?php
// Parse project PHP without executing it or loading environment credentials.
$root = dirname(__DIR__, 2);
$results = [];
foreach (['app', 'config', 'routes', 'bootstrap', 'scripts', 'tests', 'database/factories', 'database/seeders'] as $directory) {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/'.$directory, FilesystemIterator::SKIP_DOTS)) as $file) {
        if ($file->getExtension() !== 'php' || str_contains($file->getPathname(), '/bootstrap/cache/')) continue;
        $error = null;
        try { token_get_all(file_get_contents($file->getPathname()), TOKEN_PARSE); }
        catch (ParseError $exception) { $error = $exception->getMessage(); }
        $results[] = ['file' => substr($file->getPathname(), strlen($root) + 1), 'syntaxError' => $error];
    }
}
echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
exit(count(array_filter($results, fn ($result) => $result['syntaxError'] !== null)) > 0 ? 1 : 0);
