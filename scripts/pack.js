const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'manifest.json');

// Read manifest
if (!fs.existsSync(manifestPath)) {
    console.error("Error: manifest.json not found in root!");
    process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;

console.log(`=== Hivemind Extension Packer (v${version}) ===`);

const keyPath = path.join(rootDir, 'hivemind.pem');
if (!fs.existsSync(keyPath)) {
    console.warn("WARNING: 'hivemind.pem' private key not found in root directory.");
    console.warn("If this is your first release, Chrome will automatically generate one for you during packing.");
    console.warn("Ensure you KEEP the generated 'hivemind.pem' file secure and never commit it to public repositories.\n");
}

// Destination folder
const zipDest = path.join(rootDir, 'admin', 'downloads');
if (!fs.existsSync(zipDest)) {
    fs.mkdirSync(zipDest, { recursive: true });
}

// 1. ZIP Archive for manual developer-mode sideload (Kiwi/Chrome)
const zipName = `hivemind-v${version}.zip`;
console.log("Creating ZIP archive for manual developer-mode loading...");
try {
    // Remove old zip if exists to prevent appending
    const zipFilePath = path.join(zipDest, zipName);
    if (fs.existsSync(zipFilePath)) {
        fs.unlinkSync(zipFilePath);
    }
    
    // Exclude git files, admin, worker, scripts, and pem keys to keep download lightweight
    const zipCmd = `zip -r "${zipFilePath}" manifest.json jquery.min.js icon.png extension/ -x "*.DS_Store"`;
    execSync(zipCmd, { cwd: rootDir });
    console.log(`✅ Successfully created ZIP: admin/downloads/${zipName}`);
} catch (e) {
    console.error("Failed to create ZIP archive:", e.message);
}

// 2. CRX Package using Chrome CLI (if Chrome is available)
let chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(chromePath)) {
    // Try standard linux or default commands
    chromePath = "google-chrome";
}

console.log("\nAttempting to build signed .crx package via Chrome CLI...");
// Create a temporary directory containing only the extension files to pack
const tempDir = path.join(rootDir, 'temp_ext_build');
if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir);

// Copy extension files
fs.copyFileSync(manifestPath, path.join(tempDir, 'manifest.json'));
fs.copyFileSync(path.join(rootDir, 'jquery.min.js'), path.join(tempDir, 'jquery.min.js'));
fs.copyFileSync(path.join(rootDir, 'icon.png'), path.join(tempDir, 'icon.png'));

// Recursive copy helper
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (let entry of entries) {
        let srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
copyDir(path.join(rootDir, 'extension'), path.join(tempDir, 'extension'));

try {
    let packCmd = `"${chromePath}" --pack-extension="${tempDir}"`;
    if (fs.existsSync(keyPath)) {
        packCmd += ` --pack-extension-key="${keyPath}"`;
    }
    
    execSync(packCmd, { stdio: 'inherit' });
    
    // Chrome produces temp_ext_build.crx in the parent folder
    const crxSrc = path.join(rootDir, 'temp_ext_build.crx');
    const crxDest = path.join(zipDest, `hivemind-v${version}.crx`);
    
    if (fs.existsSync(crxSrc)) {
        fs.renameSync(crxSrc, crxDest);
        console.log(`✅ Successfully created signed CRX: admin/downloads/hivemind-v${version}.crx`);
    } else {
        console.warn("CRX build complete, but could not locate the output file. Make sure Chrome executed successfully.");
    }
    
    // Check if new key was generated and move it to root
    const generatedPem = path.join(rootDir, 'temp_ext_build.pem');
    if (fs.existsSync(generatedPem)) {
        fs.renameSync(generatedPem, keyPath);
        console.log(`✅ Generated new private key: 'hivemind.pem'. KEEP THIS FILE SECURE!`);
    }

} catch (e) {
    console.log("Could not compile CRX automatically. (Chrome CLI is recommended on your build machine).");
    console.log("Manual compilation steps:");
    console.log("1. Open Chrome -> Settings -> Extensions.");
    console.log("2. Enable 'Developer mode'.");
    console.log("3. Click 'Pack extension' and select the repository root directory.");
    console.log(`4. Copy the compiled .crx file to admin/downloads/hivemind-v${version}.crx`);
} finally {
    // Cleanup temporary build dir
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
