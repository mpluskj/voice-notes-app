
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

// Add headers to allow for SharedArrayBuffer, which is required by onnxruntime-web
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
  console.log('Please open index.html in your browser through this server.');
});
