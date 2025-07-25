
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: argv.mode,
    entry: './js/app.js',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/voice-notes-app/',
    },
    resolve: {
      extensions: ['.js', '.json'],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'index.html', to: 'index.html' },
          { from: 'css', to: 'css' },
          { from: 'node_modules/onnxruntime-web/dist/*.wasm', to: '[name][ext]' },
          { from: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', to: 'silero_vad.onnx' },
          { from: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', to: 'vad.worklet.js' }
        ],
      }),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'),
      },
      compress: true,
      port: 8080,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  };
};
