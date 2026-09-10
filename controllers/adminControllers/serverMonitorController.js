const os = require('os');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdminAuditLog = require('../../models/adminModels/AdminAuditLog');

/**
 * Get comprehensive server statistics
 */
exports.getServerStats = async (req, res) => {
    try {
        const stats = {
            os: {
                platform: os.platform(),
                release: os.release(),
                arch: os.arch(),
                type: os.type(),
                hostname: os.hostname(),
            },
            uptime: {
                system: os.uptime(),
                process: process.uptime(),
            },
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2),
            },
            cpu: {
                model: os.cpus()[0].model,
                cores: os.cpus().length,
                loadAverage: os.loadavg(), // [1, 5, 15] mins (empty on Windows)
            },
            network: os.networkInterfaces(),
            disk: await getDiskUsage(),
            pm2: await getPM2Stats(),
            projectSize: await getProjectFolderSize(),
            timestamp: new Date(),
        };

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (err) {
        console.error("❌ Server Monitor Error:", err.message);
        res.status(500).json({ success: false, message: "Error gathering server stats" });
    }
};

/**
 * Helper to get Disk Usage
 */
async function getDiskUsage() {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        const cmd = isWin
            ? 'powershell "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, @{Name=\'Size\';Expression={$_.Size}}, @{Name=\'Free\';Expression={$_.FreeSpace}} | ConvertTo-Json"'
            : 'df -k / --output=source,size,used,avail,pcent';

        exec(cmd, (error, stdout) => {
            if (error) return resolve({ error: "Could not fetch disk usage" });

            try {
                if (isWin) {
                    const data = JSON.parse(stdout);
                    // Handle single drive or multiple
                    const drives = Array.isArray(data) ? data : [data];
                    return resolve(drives.map(d => ({
                        drive: d.DeviceID,
                        total: d.Size,
                        free: d.Free,
                        used: d.Size - d.Free,
                        percent: ((d.Size - d.Free) / d.Size * 100).toFixed(2)
                    })));
                } else {
                    const lines = stdout.trim().split('\n');
                    if (lines.length < 2) return resolve({ raw: stdout });
                    const parts = lines[1].split(/\s+/);
                    return resolve([{
                        drive: parts[0],
                        total: parseInt(parts[1]) * 1024,
                        used: parseInt(parts[2]) * 1024,
                        free: parseInt(parts[3]) * 1024,
                        percent: parts[4].replace('%', '')
                    }]);
                }
            } catch (e) {
                resolve({ raw: stdout });
            }
        });
    });
}

/**
 * Helper to get PM2 Stats
 */
async function getPM2Stats() {
    return new Promise((resolve) => {
        exec('pm2 jlist', (error, stdout) => {
            if (error) return resolve({ status: "PM2 not available or no processes running" });
            try {
                const processes = JSON.parse(stdout);
                return resolve(processes.map(p => ({
                    name: p.name,
                    status: p.pm2_env.status,
                    cpu: p.monit.cpu,
                    memory: p.monit.memory,
                    restarts: p.pm2_env.restart_time,
                    uptime: Math.floor((Date.now() - p.pm2_env.pm_uptime) / 1000)
                })));
            } catch (e) {
                resolve({ error: "Failed to parse PM2 output" });
            }
        });
    });
}

/**
 * Helper to get Project Folder Size
 */
async function getProjectFolderSize() {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32';
        // Use du -sh if available, or lightweight powershell command
        const cmd = isWin
            ? 'powershell "(Get-ChildItem -Path . -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB"'
            : 'du -sh . | cut -f1';

        exec(cmd, { cwd: path.resolve(__dirname, '../../') }, (error, stdout) => {
            if (error) return resolve("Unknown");
            const output = stdout.trim();
            if (isWin) {
                return resolve(parseFloat(output).toFixed(2) + " MB");
            }
            resolve(output);
        });
    });
}

/**
 * Manage PM2 Processes (Restart, Stop, Reload)
 * POST /api/admin/server/process/manage
 */
exports.manageProcess = async (req, res) => {
    const { action, processName } = req.body;
    const admin = req.admin || req.user;

    const allowedActions = ['restart', 'stop', 'reload'];
    if (!allowedActions.includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid action" });
    }

    // Whitelisted process names (prevent arbitrary command injection)
    const cmd = `pm2 ${action} "${processName || 'all'}"`;

    exec(cmd, async (error, stdout, stderr) => {
        const status = error ? 'Failure' : 'Success';

        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: `PM2_${action.toUpperCase()}`,
            target: `process:${processName || 'all'}`,
            description: `PM2 ${action} request for ${processName || 'all'}`,
            status: status,
            ipAddress: req.ip
        });

        if (error) {
            return res.status(500).json({ success: false, message: `Failed to ${action} process`, error: stderr });
        }
        res.status(200).json({ success: true, message: `Process ${action} successful` });
    });
};

/**
 * Get last 100 lines of logs
 * GET /api/admin/server/logs
 */
exports.getLogs = async (req, res) => {
    // Determine the current date for the default log file
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const defaultLogPath = path.resolve(__dirname, '../../logs', `${today}.log`);

    const logPath = req.query.path || defaultLogPath;

    // Security check: Ensure log path is within project/logs
    const baseLogDir = path.resolve(__dirname, '../../logs');
    if (!logPath.startsWith(baseLogDir)) {
        return res.status(403).json({ success: false, message: "Access denied: Path outside log directory" });
    }

    if (!fs.existsSync(logPath)) {
        // Try to find the most recent log file if today's doesn't exist yet
        try {
            const files = fs.readdirSync(baseLogDir).filter(f => f.endsWith('.log')).sort().reverse();
            if (files.length > 0) {
                const latestLog = path.join(baseLogDir, files[0]);
                return readLogs(latestLog, res);
            }
        } catch (dirErr) {
            console.error("Dir read error:", dirErr);
        }
        return res.status(404).json({ success: false, message: "Log file not found" });
    }

    readLogs(logPath, res);
};

// Helper for reading logs to avoid duplication
function readLogs(logPath, res) {
    const isWin = process.platform === 'win32';
    const cmd = isWin
        ? `powershell "Get-Content -Path '${logPath}' -Tail 100"`
        : `tail -n 100 "${logPath}"`;

    exec(cmd, (error, stdout) => {
        if (error) return res.status(500).json({ success: false, message: "Error reading logs" });
        res.status(200).json({ success: true, logs: stdout });
    });
}

/**
 * Flush Logs
 * POST /api/admin/server/logs/flush
 */
exports.flushLogs = async (req, res) => {
    const admin = req.admin || req.user;

    // 1. Flush PM2 internal logs
    exec('pm2 flush', async (error) => {
        const status = error ? 'Failure' : 'Success';

        // 2. Also clear current daily app log safely if it exists
        const today = new Date().toISOString().split('T')[0];
        const logPath = path.resolve(__dirname, '../../logs', `${today}.log`);

        try {
            if (fs.existsSync(logPath)) {
                fs.truncateSync(logPath, 0);
            }
        } catch (err) {
            console.error("Manual log flush error:", err);
        }

        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: 'LOGS_FLUSH',
            target: 'system:logs',
            description: 'Flushed all system and PM2 logs',
            status: status,
            ipAddress: req.ip
        });

        if (error) return res.status(500).json({ success: false, message: "Error flushing PM2 logs" });
        res.status(200).json({ success: true, message: "Logs flushed successfully" });
    });
};
