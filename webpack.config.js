
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './js/app.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  module: {
    rules: [
      {
        test: /\.(wasm|onnx)$/,
        type: 'asset/resource',
      },
    ],
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
