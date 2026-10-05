/**
 * Builds the package that is uploaded to cPanel.
 *
 *   node scripts/build-cpanel.mjs
 *   node scripts/build-cpanel.mjs --domain=school.example.sa   (writes the address in as well)
 *   node scripts/build-cpanel.mjs --assemble                   (lays out the last build again, without rebuilding)
 *
 * cPanel's «Setup Node.js App» runs a Node server; it does not build one, and
 * a shared host has neither the memory nor the patience for `next build`. So
 * the site is built here, as Next's standalone output — the server and only
 * the modules it needs — and laid out the way the host wants to find it:
 *
 *   server.js            the startup file named in cPanel (scripts/cpanel/server.js)
 *   app.js               the same under cPanel's default name, for a form left as it came
 *   app/                 Next's standalone server, with its own node_modules
 *   app/.next/static     the browser's files
 *   app/public           icons, the service worker, the logo
 *   app/.env.production  the settings, so nothing has to be typed into cPanel
 *   app/.htaccess        refuses to serve the folder, should it ever land under a web root
 *
 * Three things here are not obvious, and each cost a broken package to learn:
 *
 * The modules sit one level down. cPanel insists that a `node_modules` in the
 * application root be its own symlink, and refuses to work beside a real one.
 *
 * The build is made in a copy of the project installed «hoisted». This
 * project is installed with pnpm, whose node_modules is a web of symlinks —
 * and on Windows those are junctions holding this machine's absolute paths.
 * A standalone folder traced from it unpacks on the host as a server whose
 * modules point at F:\… . Installed hoisted from the same lockfile, every
 * module is a real folder, the same versions, and the package is only files.
 * (The compiler adds links of its own under .next/node_modules — the database
 * driver under a hashed name. They are copied as the folders they point at.)
 *
 * The zip is written by this script, not by a tool: see writeZip.
 *
 * The result (dist-cpanel/, and the zip) holds the database address and the
 * signing secrets. It is ignored by git and must stay out of it.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.resolve(import.meta.dirname, '..')
const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3).trim() : ''
}
const fail = (message) => { console.error(`\n✗ ${message}\n`); process.exit(1) }
const step = (message) => console.log(`\n▸ ${message}`)
const run = (cmd, args, options) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options })

/**
 * A plain recursive copy that follows every link. Written out by hand:
 * fs.cpSync with `dereference` ends the process without a word when it meets
 * a Windows junction, which is exactly what this build has to cross.
 */
function copyTree(from, to, skip = () => false, trail = new Set()) {
  const real = fs.realpathSync(from)
  if (trail.has(real)) return // a link back into its own ancestors
  const stat = fs.statSync(from)
  if (!stat.isDirectory()) {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
    return
  }
  fs.mkdirSync(to, { recursive: true })
  const inside = new Set(trail).add(real)
  for (const name of fs.readdirSync(from)) {
    if (skip(name, path.join(from, name))) continue
    copyTree(path.join(from, name), path.join(to, name), skip, inside)
  }
}

/**
 * The zip, written out by hand rather than by whichever tool the machine has.
 *
 * What is being decided is what the host unpacks. Windows' own tools record
 * every file as writable by everyone, and one of them writes names with
 * backslashes, which Linux unpacks as a single flat list of oddly named
 * files. Here each name is written with forward slashes and each entry with
 * the permission it should have on the server — and the settings file with
 * one that only the account itself can read: on a shared host, a file every
 * account may read is a database password every account may read.
 */
function writeZip(zipPath, dir, modeOf) {
  if (typeof zlib.crc32 !== 'function') fail('هذا السكربت يحتاج Node.js 22 أو أحدث على جهاز البناء')
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const fd = fs.openSync(zipPath, 'w')
  const central = []
  let offset = 0
  let count = 0
  const put = (buffer) => { fs.writeSync(fd, buffer); offset += buffer.length }

  const add = (name, data, mode) => {
    const isDir = data === null
    const nameBytes = Buffer.from(name, 'utf8')
    const packed = isDir ? Buffer.alloc(0) : zlib.deflateRawSync(data, { level: 9 })
    // Files that are compressed already (fonts, images) grow when deflated; those are stored as they are.
    const deflated = !isDir && packed.length < data.length
    const body = isDir ? packed : deflated ? packed : data
    const crc = isDir ? 0 : zlib.crc32(data)
    const size = isDir ? 0 : data.length
    const at = offset

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed to unpack
    local.writeUInt16LE(0x0800, 6) // names are UTF-8
    local.writeUInt16LE(deflated ? 8 : 0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(size, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    put(local)
    put(nameBytes)
    put(body)

    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE((3 << 8) | 20, 4) // made on Unix: the permissions below are Unix ones
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(deflated ? 8 : 0, 10)
    head.writeUInt16LE(time, 12)
    head.writeUInt16LE(date, 14)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(body.length, 20)
    head.writeUInt32LE(size, 24)
    head.writeUInt16LE(nameBytes.length, 28)
    head.writeUInt32LE(((((isDir ? 0o040000 : 0o100000) | mode) << 16) | (isDir ? 0x10 : 0)) >>> 0, 38)
    head.writeUInt32LE(at, 42)
    central.push(head, nameBytes)
    count++
  }

  const walk = (folder, prefix) => {
    const entries = fs.readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const name = prefix + entry.name
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) {
        add(`${name}/`, null, 0o755)
        walk(full, `${name}/`)
      } else {
        add(name, fs.readFileSync(full), modeOf(name))
      }
    }
  }
  walk(dir, '')

  // The classic format counts entries in sixteen bits and offsets in thirty-two.
  if (count > 0xfffe || offset > 0xfffffffe) fail('الحزمة أكبر مما يحتمله ملف zip العادي')
  const centralAt = offset
  for (const part of central) put(part)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(count, 8)
  end.writeUInt16LE(count, 10)
  end.writeUInt32LE(offset - centralAt, 12)
  end.writeUInt32LE(centralAt, 16)
  put(end)
  fs.closeSync(fd)
  return count
}

// ── The address the site will answer on (may be left out) ────────────────────
const domain = arg('domain').replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase()
if (domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
  fail('الدومين غير صالح. مثال:  node scripts/build-cpanel.mjs --domain=school.example.sa')
}

// ── The settings, from this machine's own file ───────────────────────────────
const envFile = path.join(root, '.env.local')
if (!fs.existsSync(envFile)) fail('.env.local غير موجود — منه تُقرأ إعدادات الموقع')
const local = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, '$2')]),
)
for (const key of ['DATABASE_URL', 'BETTER_AUTH_SECRET']) {
  if (!local[key]) fail(`${key} غير موجود في .env.local`)
}
const push = !!(local.NEXT_PUBLIC_VAPID_PUBLIC_KEY && local.VAPID_PRIVATE_KEY)
if (!push) console.warn('  ! مفاتيح الإشعارات الفورية غير موجودة — الحزمة تُبنى والإشعارات الفورية مطفأة')

// ── A copy of the project, installed without symlinks, and built ─────────────
const work = path.join(path.dirname(root), `${path.basename(root)}-cpanel-build`)
const standalone = path.join(work, '.next', 'standalone')
step(`نسخة البناء: ${work}`)

// `--assemble`: the last build laid out again — for a change to the files this
// script itself writes, which the site's own build has no part in.
if (process.argv.includes('--assemble')) {
  if (!fs.existsSync(path.join(standalone, 'server.js'))) fail('لا يوجد بناء سابق يُعاد تجميعه — شغّل السكربت بلا ‎--assemble أولاً')
  console.log('  (إعادة تجميع آخر بناء — لم يُبنَ الموقع من جديد)')
} else {
  const LEAVE = new Set(['node_modules', '.next', '.git', '.vercel', 'dist-cpanel', 'tsconfig.tsbuildinfo'])
  // Kept between runs: installing takes minutes, and the lockfile decides whether it is still right.
  for (const name of fs.existsSync(work) ? fs.readdirSync(work) : []) {
    if (name !== 'node_modules') fs.rmSync(path.join(work, name), { recursive: true, force: true })
  }
  copyTree(root, work, (name) => LEAVE.has(name) || name.endsWith('.zip') || /backup.*\.json$/i.test(name))

  step('تثبيت المكتبات (ملفات حقيقية، بنفس نسخ pnpm-lock.yaml)…')
  // No install scripts: the build needs none of them (the compiler's binaries
  // arrive as packages of their own), and pnpm ends with an error over every
  // script it was not given leave to run — which reads as a failed install.
  const installed = run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--config.node-linker=hoisted', '--config.confirmModulesPurge=false'], { cwd: work })
  if (installed.status !== 0 || !fs.existsSync(path.join(work, 'node_modules', 'next', 'package.json'))) {
    fail('تعذّر تثبيت المكتبات في نسخة البناء')
  }

  step('بناء الموقع (نسخة مستقلة)…')
  const built = spawnSync(process.execPath, [path.join(work, 'node_modules/next/dist/bin/next'), 'build'], {
    cwd: work,
    stdio: 'inherit',
    env: { ...process.env, BUILD_STANDALONE: '1' },
  })
  // The build needed the settings; the copy of them must not outlive it.
  fs.rmSync(path.join(work, '.env.local'), { force: true })
  if (built.status !== 0) fail('فشل البناء — لم تُنشأ الحزمة')
  if (!fs.existsSync(path.join(standalone, 'server.js'))) fail('لم يُنتج البناء مجلد standalone')
}

// ── Lay it out ───────────────────────────────────────────────────────────────
step('تجميع الحزمة…')
const out = path.join(root, 'dist-cpanel')
const site = path.join(out, 'site')
const app = path.join(site, 'app')
const parts = path.join(root, 'scripts', 'cpanel')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(app, { recursive: true })

copyTree(standalone, app)
copyTree(path.join(work, '.next', 'static'), path.join(app, '.next', 'static'))
copyTree(path.join(work, 'public'), path.join(app, 'public'))

// The image optimizer's native library is traced into every standalone build,
// in this machine's flavour (Windows). The site serves its images as they are
// (images.unoptimized), so nothing ever loads it — and a Windows binary is the
// one thing in the package that a Linux host, or its upload scanner, could
// object to.
for (const name of ['sharp', '@img']) fs.rmSync(path.join(app, 'node_modules', name), { recursive: true, force: true })

// Nothing of this machine's own settings travels by accident: only the file
// written below.
for (const name of fs.readdirSync(app)) {
  if (name.startsWith('.env')) fs.rmSync(path.join(app, name), { force: true })
}

// Encrypted, always: from a shared host this connection crosses the open
// internet carrying the database password and the pupils' records, and the
// address in .env.local asks for no encryption at all. `no-verify` encrypts
// without checking the certificate — Supabase signs its pooler's with a CA of
// its own that Node does not know (a full check fails with
// SELF_SIGNED_CERT_IN_CHAIN); checking it means shipping that CA file too.
const databaseUrl = (() => {
  try {
    const asked = new URL(local.DATABASE_URL).searchParams
    if (asked.has('sslmode') || asked.has('ssl')) return local.DATABASE_URL
    return `${local.DATABASE_URL}${local.DATABASE_URL.includes('?') ? '&' : '?'}sslmode=no-verify`
  } catch {
    return local.DATABASE_URL
  }
})()

// Which build this is, for /api/health to answer with: the commit it was made
// from (with a + when the working tree held changes not yet committed) and when.
const git = (args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}
const commit = git(['rev-parse', '--short', 'HEAD']) || 'unknown'
const uncommitted = git(['status', '--porcelain', '--', '.', ':!tsconfig.tsbuildinfo', ':!next-env.d.ts']) ? '+' : ''
const buildStamp = `${commit}${uncommitted}@${new Date().toISOString().slice(0, 16)}Z`

const bare = domain.replace(/^www\./, '')
fs.writeFileSync(path.join(app, '.env.production'), [
  '# إعدادات الموقع — يقرؤها الخادم عند بدء التشغيل.',
  '# هذا الملف سرّي: فيه كلمة مرور قاعدة البيانات. لا يُنشر ولا يُرسل لأحد.',
  '',
  '# عنوان الموقع — اختياري: الموقع يعمل من أي عنوان يُفتح منه دون كتابته.',
  '# إن كُتب فبالضبط كما يُكتب في المتصفح، مع https وبلا شرطة في آخره، ثم يُعاد تشغيل التطبيق.',
  '# مثال: BETTER_AUTH_URL=https://school.example.sa',
  domain ? `BETTER_AUTH_URL=https://${domain}` : 'BETTER_AUTH_URL=',
  '# (اختياري) عناوين أخرى يُفتح منها الموقع نفسه، مفصولة بفاصلة.',
  domain ? `AUTH_TRUSTED_ORIGINS=https://${domain.startsWith('www.') ? bare : `www.${bare}`}` : 'AUTH_TRUSTED_ORIGINS=',
  '',
  '# قاعدة البيانات ومفتاح توقيع الجلسات — لا تُغيَّر.',
  `DATABASE_URL=${databaseUrl}`,
  `BETTER_AUTH_SECRET=${local.BETTER_AUTH_SECRET}`,
  '',
  '# عدد اتصالات قاعدة البيانات: خادم واحد طويل العمر يحتمل أكثر من ثمانية.',
  'DB_POOL_MAX=15',
  '# أي بناء هذا — يظهر في /api/health.',
  `APP_BUILD=${buildStamp}`,
  ...(push
    ? [
        '',
        '# الإشعارات الفورية. المفتاح العام مدموج في الموقع وقت البناء؛ تغيير أي منهما يحتاج حزمة جديدة.',
        `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${local.NEXT_PUBLIC_VAPID_PUBLIC_KEY}`,
        `VAPID_PRIVATE_KEY=${local.VAPID_PRIVATE_KEY}`,
      ]
    : []),
  ...(local.VAPID_SUBJECT ? [`VAPID_SUBJECT=${local.VAPID_SUBJECT}`] : []),
  '',
].join('\n'))

// The startup file, and its twin under the name cPanel's form starts with.
// They are kept as files of their own (scripts/cpanel/) so that they can be
// read, checked and run as they are — not as text inside this script.
fs.copyFileSync(path.join(parts, 'server.js'), path.join(site, 'server.js'))
fs.copyFileSync(path.join(parts, 'app.js'), path.join(site, 'app.js'))
// Should the folder ever be unpacked under a web root, the web server would
// hand out its files to whoever asks — the settings among them.
fs.copyFileSync(path.join(parts, 'htaccess.txt'), path.join(app, '.htaccess'))

// cPanel's form looks for one of these beside the startup file. It names no
// dependency on purpose: everything the server needs is already in app/, and
// «Run NPM Install» then has nothing to fetch and nothing to break.
fs.writeFileSync(path.join(site, 'package.json'), `${JSON.stringify({
  name: 'aws-school',
  private: true,
  version: '1.0.0',
  description: 'مدارس الأوس الأهلية — حزمة cPanel الجاهزة',
  main: 'server.js',
  scripts: { start: 'node server.js' },
  engines: { node: '>=20.9.0' },
}, null, 2)}\n`)

// Passenger restarts the app when this file's time changes; the folder has to exist.
fs.mkdirSync(path.join(site, 'tmp'), { recursive: true })
fs.writeFileSync(path.join(site, 'tmp', 'restart.txt'), '')

// ── What went in ─────────────────────────────────────────────────────────────
let files = 0
let bytes = 0
const native = []
const links = []
const foreign = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) { links.push(path.relative(site, full)); continue }
    // A name outside plain ASCII is spelled differently by different unpackers.
    if (/[^\x20-\x7e]/.test(entry.name)) foreign.push(path.relative(site, full))
    if (entry.isDirectory()) { walk(full); continue }
    files++
    bytes += fs.statSync(full).size
    if (entry.name.endsWith('.node')) native.push(path.relative(site, full))
  }
}
walk(site)
if (links.length) fail(`بقيت روابط في الحزمة (لن تعمل على الخادم): ${links.slice(0, 5).join('، ')}`)
if (foreign.length) fail(`في الحزمة أسماء ملفات بغير الحروف اللاتينية (قد تُفك على الخادم باسم آخر): ${foreign.slice(0, 5).join('، ')}`)
for (const must of ['server.js', 'app.js', 'package.json', 'tmp/restart.txt', 'app/server.js', 'app/.env.production', 'app/.htaccess', 'app/.next/BUILD_ID', 'app/.next/static', 'app/public/sw.js', 'app/node_modules/next/package.json']) {
  if (!fs.existsSync(path.join(site, must))) fail(`ناقص من الحزمة: ${must}`)
}
if (native.length) {
  console.warn('  ! في الحزمة ملفات مبنية لنظام هذا الجهاز لا لخادم لينكس — إن احتاجها الموقع وقت التشغيل فلن تعمل هناك:')
  for (const n of native) console.warn(`    ${n}`)
}

// ── Zip ──────────────────────────────────────────────────────────────────────
step('ضغط الحزمة…')
const zip = path.join(out, 'aws-cpanel.zip')
writeZip(zip, site, (name) => (name === 'app/.env.production' ? 0o600 : 0o644))

console.log(`
✓ الحزمة جاهزة
  الملف:   ${zip}
  الحجم:   ${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB  (${files} ملفاً، ${(bytes / 1024 / 1024).toFixed(1)} MB قبل الضغط)
  العنوان: ${domain ? `https://${domain}` : 'لم يُكتب — الموقع يعمل من أي عنوان يُفتح منه'}
  الإشعارات الفورية: ${push ? 'مفعَّلة' : 'مطفأة'}
  البناء:  ${buildStamp}
`)
