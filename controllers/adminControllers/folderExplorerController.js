const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Define the root directory for exploration (Security Guard)
const BASE_PATH = path.resolve(__dirname, '../../../'); // Project root: R:\Suriya.DLK\newProject

/**
 * Explore folders and get their sizes
 * GET /api/admin/server/explore?folderPath=relative/path
 */
exports.exploreFolder = async (req, res) => {
    try {
        const relativePath = req.query.folderPath || '';

        // 1. Security: Resolve and check path
        const targetPath = path.normalize(path.join(BASE_PATH, relativePath)).replace(/^(\.\.(\/|\\|$))+/, '');

        if (!targetPath.startsWith(BASE_PATH)) {
            return res.status(403).json({ success: false, message: "Access Denied: Path outside base directory" });
        }

        const isWin = process.platform === 'win32';

        // 2. Command Execution
        // Linux: du -h --max-depth=1 <path>
        // Windows Fallback: PowerShell to get folder sizes
        const cmd = isWin
            ? `powershell -Command "Get-ChildItem -Path '${targetPath}' -Directory | ForEach-Object { $size = (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; [PSCustomObject]@{ Name=$_.Name; Size=[Math]::Round($size / 1MB, 2) } } | ConvertTo-Json"`
            : `du -h --max-depth=1 "${targetPath}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Exec error: ${error}`);
                return res.status(500).json({ success: false, message: "Error calculating folder sizes" });
            }

            let result = [];
            try {
                if (isWin) {
                    if (!stdout.trim()) {
                        result = [];
                    } else {
                        const data = JSON.parse(stdout);
                        const folders = Array.isArray(data) ? data : [data];
                        result = folders.map(f => ({
                            name: f.Name,
                            size: f.Size + " MB",
                            path: path.relative(BASE_PATH, path.join(targetPath, f.Name)).replace(/\\/g, '/')
                        }));
                    }
                } else {
                    // Parse du -h output
                    // Format: "size\tpath"
                    const lines = stdout.trim().split('\n');
                    result = lines
                        .filter(line => {
                            const [size, folder] = line.split(/\s+/);
                            return folder !== targetPath && folder !== targetPath + '/';
                        })
                        .map(line => {
                            const [size, folderPath] = line.split(/\s+/);
                            const name = path.basename(folderPath);
                            return {
                                name: name,
                                size: size,
                                path: path.relative(BASE_PATH, folderPath).replace(/\\/g, '/')
                            };
                        });
                }

                res.status(200).json({
                    success: true,
                    currentPath: relativePath,
                    parentPath: relativePath ? path.dirname(relativePath).replace(/\\/g, '/') : null,
                    folders: result
                });
            } catch (parseErr) {
                console.error("Parse error:", parseErr);
                res.status(500).json({ success: false, message: "Error parsing folder data" });
            }
        });

    } catch (err) {
        console.error("Folder Explorer Error:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
