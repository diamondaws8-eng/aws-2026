const fs = require('fs');
const path = require('path');

const basePath = 'f:/aws/app/parent';
const dashPath = path.join(basePath, '(dashboard)');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(path.join(dashPath, 'child', '[studentId]', 'attendance'));
ensureDir(path.join(dashPath, 'child', '[studentId]', 'grades'));
ensureDir(path.join(dashPath, 'notifications'));

function moveFile(src, dest) {
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
    }
}

moveFile(path.join(basePath, 'page.tsx'), path.join(dashPath, 'page.tsx'));
moveFile(path.join(basePath, 'actions.ts'), path.join(dashPath, 'actions.ts'));
moveFile(path.join(basePath, 'child', '[studentId]', 'page.tsx'), path.join(dashPath, 'child', '[studentId]', 'page.tsx'));
moveFile(path.join(basePath, 'child', '[studentId]', 'attendance', 'page.tsx'), path.join(dashPath, 'child', '[studentId]', 'attendance', 'page.tsx'));
moveFile(path.join(basePath, 'child', '[studentId]', 'grades', 'page.tsx'), path.join(dashPath, 'child', '[studentId]', 'grades', 'page.tsx'));
moveFile(path.join(basePath, 'notifications', 'page.tsx'), path.join(dashPath, 'notifications', 'page.tsx'));

try { fs.rmSync(path.join(basePath, 'child'), { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(path.join(basePath, 'notifications'), { recursive: true, force: true }); } catch (e) {}
try { fs.unlinkSync(path.join(basePath, 'layout.tsx')); } catch (e) {}

console.log('done');
