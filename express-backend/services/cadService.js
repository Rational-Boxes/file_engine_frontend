const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

class CadService {
  constructor() {
    this.supportedCadFormats = ['.step', '.stp', '.iges', '.igs', '.stl', '.obj', '.dae', '.fbx'];
    this.viewerOutputDir = process.env.CAD_VIEWER_OUTPUT || './cad-viewers';
  }

  async convertToWebViewer(inputPath, outputDir) {
    const ext = path.extname(inputPath).toLowerCase();
    
    if (!this.supportedCadFormats.includes(ext)) {
      throw new Error(`Unsupported CAD format: ${ext}`);
    }

    // Generate unique ID for this conversion
    const conversionId = `cad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const outputSubdir = path.join(outputDir, conversionId);

    await fs.mkdir(outputSubdir, { recursive: true });

    if (ext === '.stl') {
      // For STL files, we can directly use them with Xeokit
      return await this.processStlFile(inputPath, outputSubdir);
    } else {
      // Convert other CAD formats to X3D or glTF for web viewing
      return await this.convertCadToWebFormat(inputPath, outputSubdir);
    }
  }

  async processStlFile(inputPath, outputDir) {
    // Copy STL file to output directory
    const outputStlPath = path.join(outputDir, path.basename(inputPath));
    await fs.copyFile(inputPath, outputStlPath);

    // Generate XeoKit viewer HTML
    const viewerHtml = this.generateXeoKitViewer(outputStlPath);
    const viewerPath = path.join(outputDir, 'viewer.html');
    
    await fs.writeFile(viewerPath, viewerHtml);
    
    return {
      viewerUrl: `/cad-viewer/${path.basename(outputDir)}/viewer.html`,
      modelPath: `/cad-viewer/${path.basename(outputDir)}/${path.basename(inputPath)}`,
      format: 'stl'
    };
  }

  async convertCadToWebFormat(inputPath, outputDir) {
    // This would typically use Open CASCADE, FreeCAD, or similar CAD libraries
    // For now, this is a placeholder implementation
    
    return new Promise((resolve, reject) => {
      // Example using FreeCAD command line (if available)
      const freecad = spawn('freecadcmd', [
        '--console',
        '-c', `import FreeCAD, Import; doc = FreeCAD.newDocument(); Import.insert(u"${inputPath}", doc.Name); __export__("${outputDir}/output.stl"); FreeCAD.closeDocument(doc.Name)`
      ]);

      let stderr = '';
      freecad.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      freecad.on('close', (code) => {
        if (code === 0) {
          resolve({
            viewerUrl: `/cad-viewer/${path.basename(outputDir)}/viewer.html`,
            modelPath: `/cad-viewer/${path.basename(outputDir)}/output.stl`,
            format: 'stl'
          });
        } else {
          reject(new Error(`CAD conversion failed: ${stderr}`));
        }
      });
    });
  }

  generateXeoKitViewer(modelPath) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>CAD Model Viewer</title>
    <script src="https://cdn.jsdelivr.net/npm/xeokit-convert@2.0.11/dist/xeokit-convert.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/xeokit-sdk@1.0.0/dist/xeokit-sdk.js"></script>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; }
        #viewer { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <div id="viewer"></div>
    <script>
        const viewer = new XEO.viewer({
            element: document.getElementById("viewer"),
            transparent: true
        });

        // Load the CAD model
        new XEO.plugins.STLLoader(viewer).load({
            id: "myModel",
            src: "${modelPath}",
            edges: true,
            edgeThreshold: 20
        });
    </script>
</body>
</html>
    `;
  }
}

module.exports = new CadService();