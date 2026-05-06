const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const AdmZip   = require('adm-zip');

/**
 * Download een bestand van een URL naar een tijdelijk pad.
 * Volgt maximaal 5 redirects.
 */
function downloadToTemp(url, onProgress) {
  return new Promise((resolve, reject) => {
    const tempPath = path.join(os.tmpdir(), `stig-download-${Date.now()}`);
    const file     = fs.createWriteStream(tempPath);

    let redirectCount = 0;

    function doRequest(currentUrl) {
      if (redirectCount > 5) {
        file.close();
        reject(new Error('Te veel redirects bij downloaden.'));
        return;
      }

      const client = currentUrl.startsWith('https') ? https : http;
      client.get(currentUrl, res => {
        // Redirect afhandeling
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          redirectCount++;
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).href;
          doRequest(redirectUrl);
          return;
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(tempPath, () => {});
          reject(new Error(`Download mislukt: HTTP ${res.statusCode}`));
          return;
        }

        const total    = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;

        res.on('data', chunk => {
          downloaded += chunk.length;
          if (onProgress && total > 0) {
            onProgress(Math.round((downloaded / total) * 100));
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(tempPath);
        });
        file.on('error', err => {
          fs.unlink(tempPath, () => {});
          reject(err);
        });
      }).on('error', err => {
        file.close();
        fs.unlink(tempPath, () => {});
        reject(err);
      });
    }

    doRequest(url);
  });
}

/**
 * Detecteer of een bestand een ZIP is aan de hand van de magic bytes.
 */
function isZip(filePath) {
  const buf = Buffer.alloc(4);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  // ZIP magic: PK\x03\x04
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/**
 * Extraheer het eerste XCCDF XML-bestand uit een ZIP.
 * DISA-ZIPs bevatten doorgaans één of meerdere XML-bestanden.
 * We kiezen het eerste bestand dat eindigt op _Manual-xccdf.xml of gewoon .xml.
 */
function extractXmlFromZip(zipPath) {
  const zip     = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Voorkeur: bestanden met 'xccdf' in de naam
  const xccdfEntry = entries.find(e =>
    e.entryName.toLowerCase().includes('xccdf') && e.entryName.toLowerCase().endsWith('.xml')
  );

  // Fallback: elk xml-bestand dat geen __MACOSX is
  const xmlEntry = xccdfEntry ?? entries.find(e =>
    e.entryName.toLowerCase().endsWith('.xml') && !e.entryName.includes('__MACOSX')
  );

  if (!xmlEntry) {
    throw new Error('Geen XML-bestand gevonden in het ZIP-archief.');
  }

  const tempXmlPath = path.join(os.tmpdir(), `stig-extracted-${Date.now()}.xml`);
  zip.extractEntryTo(xmlEntry, os.tmpdir(), false, true, false, `stig-extracted-${Date.now()}.xml`);

  // adm-zip schrijft naar tempdir/entryName, niet naar het exacte pad — geef het werkelijke pad terug
  const extractedName  = path.basename(xmlEntry.entryName);
  const actualPath     = path.join(os.tmpdir(), extractedName);

  return { xmlPath: actualPath, originalName: extractedName };
}

/**
 * Hoofd-export: download van URL, pak uit indien ZIP, geef XML-pad terug.
 * @param {string} url
 * @param {(pct: number) => void} [onProgress]
 * @returns {{ xmlPath: string, tempFiles: string[], format: 'xml'|'csv' }}
 */
async function downloadStig(url, onProgress) {
  const downloadedPath = await downloadToTemp(url, onProgress);
  const tempFiles      = [downloadedPath];

  const urlLower = url.toLowerCase().split('?')[0];

  if (isZip(downloadedPath) || urlLower.endsWith('.zip')) {
    const { xmlPath, originalName } = extractXmlFromZip(downloadedPath);
    tempFiles.push(xmlPath);
    return { xmlPath, tempFiles, format: 'xml', originalName };
  }

  if (urlLower.endsWith('.csv')) {
    return { xmlPath: downloadedPath, tempFiles, format: 'csv', originalName: path.basename(urlLower) };
  }

  // Aannemen dat het XML is
  return { xmlPath: downloadedPath, tempFiles, format: 'xml', originalName: path.basename(urlLower) || 'stig.xml' };
}

/**
 * Verwijder tijdelijke bestanden na import.
 */
function cleanupTempFiles(paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch (_) { /* negeer */ }
  }
}

module.exports = { downloadStig, cleanupTempFiles };
