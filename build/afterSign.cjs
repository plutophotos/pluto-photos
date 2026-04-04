/**
 * afterSign hook for electron-builder
 *
 * On macOS Sequoia (15.x+), all code loaded into a process must share the
 * same Team ID.  The pre-built Electron Framework ships with the Electron
 * team's signature, while our unsigned/ad-hoc app binary has an empty Team ID.
 * This mismatch causes an immediate DYLD crash at launch.
 *
 * This hook runs AFTER electron-builder's own signing phase and force
 * re-signs the entire .app bundle with a consistent ad-hoc identity (`-`),
 * giving every binary the same (empty) Team ID.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterSign(context) {
  // Only relevant on macOS
  if (process.platform !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn(`afterSign: app bundle not found at ${appPath}, skipping re-sign`);
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  // Use Developer ID if APPLE_TEAM_ID is set, otherwise fall back to ad-hoc
  const identity = APPLE_TEAM_ID ? `Developer ID Application: ${APPLE_TEAM_ID}` : '-';
  const useDevId = identity !== '-';

  console.log(`afterSign: Re-signing ${appPath} with ${useDevId ? 'Developer ID' : 'ad-hoc'} identity...`);

  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks');
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');

  // 1. Sign all nested helper apps (Electron Helper, GPU Helper, etc.)
  const helpers = findByExtension(frameworksPath, '.app');
  for (const helper of helpers) {
    codesign(helper, identity, useDevId ? entitlements : null);
  }

  // 2. Sign all framework bundles (Electron Framework, etc.)
  const frameworks = findByExtension(frameworksPath, '.framework');
  for (const fw of frameworks) {
    codesign(fw, identity, useDevId ? entitlements : null);
  }

  // 2b. Sign standalone native executables in app.asar.unpacked (e.g. ffmpeg)
  const unpackedDir = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked');
  if (fs.existsSync(unpackedDir)) {
    const execs = findExecutables(unpackedDir);
    for (const execPath of execs) {
      console.log(`  codesign (native exec): ${path.relative(unpackedDir, execPath)}`);
      codesign(execPath, identity, null);
    }
  }

  // 3. Sign the main app bundle last (outermost signature)
  codesign(appPath, identity, useDevId ? entitlements : null);

  console.log('afterSign: Re-signing complete');

  // 4. Notarize if Apple credentials are available
  //    Requires: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
  //    See: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
  if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID) {
    console.log('afterSign: Notarizing app with Apple...');
    try {
      const { notarize } = require('@electron/notarize');
      await notarize({
        appBundleId: 'com.pluto.photos',
        appPath,
        appleId: APPLE_ID,
        appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
        teamId: APPLE_TEAM_ID,
      });
      console.log('afterSign: Notarization complete');
    } catch (notarizeErr) {
      console.error('afterSign: Notarization failed:', notarizeErr.message);
      throw notarizeErr; // Fail the build — don't ship un-notarized releases
    }
  } else {
    console.log('afterSign: Skipping notarization (APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID not set)');
  }
};

function codesign(targetPath, identity, entitlements) {
  console.log(`  codesign: ${path.basename(targetPath)}`);
  const args = ['--force', '--sign', identity];
  // Developer ID signing needs a secure timestamp and entitlements for hardened runtime
  if (identity !== '-') {
    args.push('--timestamp'); // secure timestamp (required for notarization)
    args.push('--options', 'runtime'); // hardened runtime
    if (entitlements) args.push('--entitlements', entitlements);
  } else {
    args.push('--timestamp=none');
  }
  args.push(targetPath);
  // Use execFileSync to bypass shell — prevents shell injection via path metacharacters
  execFileSync('codesign', args, { stdio: 'inherit' });
}

/**
 * Recursively find items ending with the given extension under `dir`.
 * Returns deepest matches first (inside-out signing order).
 */
function findByExtension(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(ext)) {
        // Recurse inside first to find nested bundles
        results.push(...findByExtension(fullPath, ext));
        results.push(fullPath);
      } else {
        results.push(...findByExtension(fullPath, ext));
      }
    }
  }
  return results;
}

/**
 * Recursively find executable files (Mach-O binaries) under `dir`.
 * Skips .app, .framework, and node_modules/.package-lock.json etc.
 * Only returns files that have the execute bit set.
 */
function findExecutables(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip bundle directories — they are signed separately
      if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) continue;
      results.push(...findExecutables(fullPath));
    } else if (entry.isFile()) {
      // Check for execute permission
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        // Skip obvious non-binaries
        const ext = path.extname(entry.name).toLowerCase();
        if (['.js', '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml', '.sh'].includes(ext)) continue;
        if (entry.name.startsWith('.')) continue;
        results.push(fullPath);
      } catch {
        // Not executable — skip
      }
    }
  }
  return results;
}
