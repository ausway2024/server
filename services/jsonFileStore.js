const fs = require("fs");
const path = require("path");

// ==========================================================
// GENERIC JSON FILE STORE
// ==========================================================
// Backs Users.json / Drivers.json. Reads and writes are both
// SYNCHRONOUS on purpose: these files are small "current state" snapshots
// (one row per active user/driver, rewritten in full on every update),
// and Node is single-threaded, so a sync write completes before the next
// line of JS runs. Using async writes here previously caused two updates
// arriving back-to-back (e.g. updateLocation immediately followed by
// setBookingDetails for the same id) to race — the second one would
// read the file before the first write had actually landed on disk,
// silently dropping fields. Sync I/O makes that impossible.
// ==========================================================

const DATA_DIR = path.join(__dirname, "..", "data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(fileName) {
    return path.join(DATA_DIR, fileName);
}

function readJson(fileName) {
    const fp = filePath(fileName);
    try {
        if (!fs.existsSync(fp)) return {};
        const raw = fs.readFileSync(fp, "utf8").trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.log(`⚠️  Failed to read ${fileName}:`, err.message);
        return {};
    }
}

function writeJson(fileName, dataObj) {
    const fp = filePath(fileName);
    try {
        fs.writeFileSync(fp, JSON.stringify(dataObj, null, 2), "utf8");
    } catch (err) {
        console.log(`⚠️  Failed to write ${fileName}:`, err.message);
    }
}

// Read-modify-write a single record inside a JSON file keyed by id.
// `mutator` receives the existing record (or {} if new) and must return
// the updated record.
function upsertRecord(fileName, id, mutator) {
    const all = readJson(fileName);
    const existing = all[id] || {};
    const updated = mutator({ ...existing });
    all[id] = updated;
    writeJson(fileName, all);
    return updated;
}

function deleteRecord(fileName, id) {
    const all = readJson(fileName);
    if (all[id]) {
        delete all[id];
        writeJson(fileName, all);
    }
}

function getRecord(fileName, id) {
    const all = readJson(fileName);
    return all[id] || null;
}

function getAllRecords(fileName) {
    return readJson(fileName);
}

module.exports = {
    readJson,
    writeJson,
    upsertRecord,
    deleteRecord,
    getRecord,
    getAllRecords
};
