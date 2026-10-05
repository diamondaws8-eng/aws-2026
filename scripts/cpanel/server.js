'use strict'
/*
 * ملف التشغيل لتطبيق Node.js في cPanel — اسمه يُكتب في خانة «Application startup file».
 * الموقع نفسه في مجلد app بجانبه؛ هذا الملف يشغّله فقط.
 * (مصدره scripts/cpanel/server.js في المشروع، ويُنسخ إلى الحزمة كما هو.)
 */
// Plain names, not «node:fs»: on the very old Node versions some hosts still
// offer, that spelling fails before the version check below can say why.
const fs = require('fs')
const path = require('path')
const util = require('util')
const { pathToFileURL } = require('url')

// What stops the site from starting is written beside this file as well as to
// the host's own log: on many hosts that log cannot be opened from cPanel, and
// «the site does not open» is then all anyone has to go on.
const errorLog = path.join(__dirname, 'startup-error.log')
function note(what, detail) {
  try {
    const text = detail && detail.stack ? detail.stack : detail == null ? '' : String(detail)
    fs.appendFileSync(errorLog, '[' + new Date().toISOString() + '] ' + what + (text ? '\n' + text : '') + '\n\n', { mode: 0o600 })
  } catch (_) {
    // A log that cannot be written must not be what stops the site.
  }
}
try {
  if (fs.statSync(errorLog).size > 200 * 1024) fs.truncateSync(errorLog, 0)
} catch (_) {
  // No log yet.
}

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 9)) {
  const message = 'هذا الموقع يحتاج Node.js 20.9 أو أحدث — النسخة الحالية ' + process.versions.node + '. غيِّرها من Setup Node.js App ثم أعد تشغيل التطبيق.'
  console.error(message)
  note(message)
  process.exit(1)
}

process.on('uncaughtExceptionMonitor', (error) => note('خطأ غير متوقع في الخادم', error))
process.on('exit', (code) => {
  // 130 and 143 are the host stopping or restarting the app, not a failure.
  if (code && code !== 130 && code !== 143) note('توقف الخادم — رمز الخروج ' + code)
})
// For the first seconds, whatever the server prints as an error is kept too: a
// failure to start is reported that way, and then the process simply ends.
let starting = true
const printError = console.error
console.error = function (...args) {
  if (starting) note('أثناء بدء التشغيل', util.format(...args))
  return printError.apply(console, args)
}
setTimeout(() => {
  starting = false
}, 20000).unref()

process.env.NODE_ENV = 'production'
// The clock the site was written and tested on. Sessions and their expiry are
// stored as plain times; read back on a server set to another zone they would
// all shift by its offset. (The school's own day is worked out for Riyadh in
// the code itself and does not depend on this.)
process.env.TZ = 'UTC'

// cPanel runs the app through Passenger, or through LiteSpeed's loader. Both
// take the server's listen() and hand it a socket of their own; the port that
// was asked for is ignored. Next, though, remembers the address it asked for
// as «where I can be reached», and after a redirect inside a server action it
// calls that address itself — passing the visitor's cookies along. On a shared
// server «port 3000 on this machine» may well be another customer's app. So
// under those loaders the address asked for is one that nothing can be sent
// to: no ordinary account can listen on port 1, and fetch refuses to call it.
// The redirect then reaches the visitor the ordinary way, one step later.
const hosted = typeof PhusionPassenger !== 'undefined' || typeof LsNode !== 'undefined'
if (hosted) {
  process.env.HOSTNAME = '127.0.0.1'
  process.env.PORT = '1'
} else {
  // Run by hand (`node server.js`). On most Linux hosts HOSTNAME is the
  // machine's own name, and the server would listen on that alone.
  process.env.HOSTNAME = '0.0.0.0'
  if (!process.env.PORT) process.env.PORT = '3000'
}

const appDir = path.join(__dirname, 'app')
// The settings file holds the database password. The zip carries it as
// readable by the account alone, but not every way of unpacking keeps that.
try {
  fs.chmodSync(path.join(appDir, '.env.production'), 0o600)
} catch (_) {
  // Not ours to change, or not there: the server will say so itself.
}
process.chdir(appDir)
import(pathToFileURL(path.join(appDir, 'server.js')).href).catch((error) => {
  console.error('تعذّر تشغيل الموقع:', error)
  process.exit(1)
})
