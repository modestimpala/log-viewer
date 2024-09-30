const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { createReadStream } = require('fs');
const readline = require('readline');
const util = require('util');
const gunzip = util.promisify(zlib.gunzip);

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const config = {
    logDirectory: process.env.LOG_DIRECTORY || '../ariralchat/logs'
};

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Function to read and parse log files
async function readLogFile(filePath) {
    let fileContent;
    if (filePath.endsWith('.gz')) {
        const compressedContent = await fs.readFile(filePath);
        fileContent = await gunzip(compressedContent);
    } else {
        fileContent = await fs.readFile(filePath, 'utf8');
    }

    const lines = fileContent.toString().split('\n');
    const logs = [];

    for (const line of lines) {
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (info|warn|error): (.+)$/);
        if (match) {
            const [, timestamp, level, message] = match;
            const ipMatch = message.match(/IP: ([^\s,\)]+)/);
            const userMatch = message.match(/(?:User|Chat:) (\S+)/);
            
            logs.push({
                timestamp,
                level,
                message,
                ip: ipMatch ? ipMatch[1] : null,
                username: userMatch ? userMatch[1] : null
            });
        }
    }

    return logs;
}

// Route to list all log files
app.get('/', async (req, res) => {
    try {
        const files = await fs.readdir(config.logDirectory);
        const logFiles = files.filter(file => file.endsWith('.log') || file.endsWith('.log.gz'));
        res.render('index', { logFiles });
    } catch (err) {
        console.error('Error reading log directory:', err);
        res.status(500).send('Error reading log directory');
    }
});

// Route to view a specific log file
app.get('/view/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(config.logDirectory, filename);
    const filter = req.query.filter;
    const filterType = req.query.filterType;

    try {
        const logs = await readLogFile(filePath);
        const filteredLogs = filter && filterType
            ? logs.filter(log => log[filterType] === filter)
            : logs;
        res.render('view', { 
            filename, 
            logs: filteredLogs || [],
            filter, 
            filterType,
            error: null
        });
    } catch (err) {
        console.error('Error reading log file:', err);
        res.render('view', { 
            filename, 
            logs: [], 
            filter: null, 
            filterType: null,
            error: 'Error reading log file. Please check if the file exists and is accessible.'
        });
    }
});

// Route to search logs
app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.render('search', { query: '', results: [] });
    }

    const results = [];

    try {
        const files = await fs.readdir(config.logDirectory);
        const logFiles = files.filter(file => file.endsWith('.log') || file.endsWith('.log.gz'));

        for (const file of logFiles) {
            const filePath = path.join(config.logDirectory, file);
            const logs = await readLogFile(filePath);
            const matchedLogs = logs.filter(log => 
                log.message.toLowerCase().includes(query.toLowerCase())
            );
            if (matchedLogs.length > 0) {
                results.push({ filename: file, logs: matchedLogs });
            }
        }

        res.render('search', { query, results });
    } catch (err) {
        console.error('Error searching log files:', err);
        res.status(500).render('search', { 
            query, 
            results: [], 
            error: 'Error searching log files. Please try again.'
        });
    }
});

// Start the server
app.listen(port, 'localhost', () => {
    console.log(`Log parser app listening at http://localhost:${port}`);
    console.log(`Reading logs from directory: ${config.logDirectory}`);
});
