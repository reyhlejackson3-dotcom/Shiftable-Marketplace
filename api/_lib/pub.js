'use strict';

const crypto = require('crypto');
const { gradeLetter } = require('./score');

// One-way hash of the visitor's IP. Only used to rate-limit; the IP itself is never stored.
function ipHash(req) {
  const fwd = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  const ip = fwd || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHash('sha256').update('scorer|' + (process.env.SCORER_SALT || 'shiftable') + '|' + ip).digest('hex');
}

// What a visitor sees BEFORE they unlock: the grade, the weakest area and how many problems were
// found. No scores, no check results, no problem text: those only leave the server after unlock.
function teaser(row) {
  const r = row.report || {};
  const cats = (r.categories || []).filter((c) => c.score != null);
  const real = cats.filter((c) => !c.estimate);
  const pool = real.length ? real : cats;
  let weakest = null;
  for (const c of pool) if (!weakest || c.score / c.max < weakest.score / weakest.max) weakest = c;
  return {
    scan_id: row.id,
    host: row.host,
    grade: row.grade || gradeLetter(row.score || 0),
    weakest: weakest ? weakest.name : null,
    problems: (r.issues || []).length,
    categories: (r.categories || []).map((c) => c.name),
  };
}

// Everything, after unlock.
function fullReport(row) {
  const r = row.report || {};
  return {
    scan_id: row.id,
    host: row.host,
    score: row.score,
    grade: row.grade || gradeLetter(row.score || 0),
    categories: r.categories || [],
    issues: r.issues || [],
    passes: r.passes || [],
    checked: r.checked || 0,
    partial: !!r.partial,
  };
}

// US-style phone check: 10 digits (optional leading 1), area code and exchange can't start with 0/1,
// and obvious fakes (all one digit, 1234567890) are refused.
function cleanPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  if (/^(\d)\1{9}$/.test(d) || d === '2345678901' || d === '9876543210') return null;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function cleanEmail(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (e.length > 200 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(e)) return null;
  return e;
}

module.exports = { ipHash, teaser, fullReport, cleanPhone, cleanEmail };
