/** Runtime source manifest. Hash helper excluded explicitly; no embedded hash/self-reference.
 * Served source bytes (UTF-8) and the same letters text used by app are hashed, not HEAD.
 * Keep the local server/workspace frozen during a run; reload after any source edit.
 */
export const CODE_FILES = [
  'app.js', 'src/camera.js', 'src/coords.js', 'src/evaluate.js',
  'src/inputQuality.js', 'src/judge.js', 'src/passState.js', 'src/snapshot.js',
  'src/types.js', 'content/letters.json',
];
export const RULE_FILES = [
  'src/coords.js', 'src/evaluate.js', 'src/inputQuality.js', 'src/judge.js',
  'src/passState.js', 'content/letters.json',
];
async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function loadVersionManifest(lettersText) {
  const files = [];
  for (const path of CODE_FILES) {
    let text = path === 'content/letters.json' ? lettersText : undefined;
    if (text === undefined) {
      const res = await fetch(`./${path}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Version source unavailable: ${path} (${res.status})`);
      text = await res.text();
    }
    files.push({ path, sha256: await sha256(text) });
  }
  const digest = async entries => `sha256:${await sha256(entries.map(f => `${f.path}\0${f.sha256}\n`).join(''))}`;
  return Object.freeze({
    algorithm: 'SHA-256', format: 'path NUL sha256 LF; manifest order',
    excluded: ['src/versions.js'], files,
    codeVersion: await digest(files),
    rulesVersion: await digest(files.filter(f => RULE_FILES.includes(f.path))),
  });
}
